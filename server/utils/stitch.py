import cv2
import numpy as np
import sys

def stitch_images(img1, img2):
    """
    Stitches img2 onto img1 using SIFT feature matching and RANSAC homography.
    Specifically tuned for flat, high-contrast documents and receipts.
    """
    # Convert to grayscale for precise feature detection
    gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

    # Use SIFT (Scale-Invariant Feature Transform) - Highly robust for text and edges
    sift = cv2.SIFT_create(nfeatures=5000)
    
    kp1, des1 = sift.detectAndCompute(gray1, None)
    kp2, des2 = sift.detectAndCompute(gray2, None)

    if des1 is None or des2 is None:
        return None

    # FLANN matcher parameters for SIFT
    FLANN_INDEX_KDTREE = 1
    index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
    search_params = dict(checks=50)

    flann = cv2.FlannBasedMatcher(index_params, search_params)
    
    # Find the 2 best matches for each descriptor in img2 against img1
    matches = flann.knnMatch(des2, des1, k=2)

    # Lowe's Ratio Test to eliminate false positives (ambiguous text characters)
    good_matches = []
    for match in matches:
        if len(match) == 2:
            m, n = match
            # If the closest match is significantly closer than the second closest, it's a true match
            if m.distance < 0.75 * n.distance:
                good_matches.append(m)

    # Need a minimum of 10 solid geometric anchors to mathematically warp a flat plane
    if len(good_matches) < 10:
        return None

    # Extract coordinates of the verified matches
    src_pts = np.float32([kp2[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([kp1[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    # Since the images were already manually flattened in the frontend scanner UI,
    # we DO NOT want a 3D Homography (which causes artificial slanting). 
    # We restrict the math to a 2D Rigid Transform (Translation + Rotation + Scale).
    M, mask = cv2.estimateAffinePartial2D(src_pts, dst_pts, method=cv2.RANSAC, ransacReprojThreshold=5.0)

    if M is None:
        return None

    # Convert the 2x3 Affine matrix into a 3x3 Homography matrix so the rest of the canvas math works
    H = np.vstack([M, [0, 0, 1]])

    # Get dimensions of both images
    h1, w1 = img1.shape[:2]
    h2, w2 = img2.shape[:2]

    # Calculate where the corners of img2 will end up after being warped
    pts2 = np.float32([[0, 0], [0, h2], [w2, h2], [w2, 0]]).reshape(-1, 1, 2)
    pts2_transformed = cv2.perspectiveTransform(pts2, H)

    # Calculate the dimensions of the final "Mega Canvas" that fits both images
    pts = np.concatenate((pts2_transformed, np.float32([[0, 0], [0, h1], [w1, h1], [w1, 0]]).reshape(-1, 1, 2)), axis=0)
    [xmin, ymin] = np.int32(pts.min(axis=0).ravel() - 0.5)
    [xmax, ymax] = np.int32(pts.max(axis=0).ravel() + 0.5)

    # Translation matrix to shift the canvas so there are no negative coordinates
    t = [-xmin, -ymin]
    Ht = np.array([[1, 0, t[0]], [0, 1, t[1]], [0, 0, 1]])

    # Warp the bottom segment (img2) onto the mega canvas
    result = cv2.warpPerspective(img2, Ht.dot(H), (xmax - xmin, ymax - ymin))

    # Overlay the top segment (img1) perfectly on top
    result[t[1]:h1+t[1], t[0]:w1+t[0]] = img1
    
    return result

def main():
    if len(sys.argv) < 3:
        print("Usage: python stitch.py <output_path> <image1_path> <image2_path> ...")
        sys.exit(1)

    output_path = sys.argv[1]
    image_paths = sys.argv[2:]

    images = []
    for p in image_paths:
        img = cv2.imread(p)
        if img is not None:
            images.append(img)
        else:
            print(f"Error loading {p}")
            sys.exit(1)

    # Start with the first image segment
    base_image = images[0]

    # Iteratively stitch the following segments onto the growing mega-canvas
    for next_image in images[1:]:
        stitched = stitch_images(base_image, next_image)
        if stitched is None:
            print("STITCH_ERROR: 1 (Failed to find enough overlapping text features)")
            sys.exit(1)
        base_image = stitched

    cv2.imwrite(output_path, base_image)
    print("SUCCESS")

if __name__ == "__main__":
    main()
