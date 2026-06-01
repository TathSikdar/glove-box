import cv2
import numpy as np
import sys
import json
import traceback

def order_points(pts):
    # initialize a list of coordinates that will be ordered
    # such that the first entry in the list is the top-left,
    # the second entry is the top-right, the third is the
    # bottom-right, and the fourth is the bottom-left
    rect = np.zeros((4, 2), dtype="float32")

    # the top-left point will have the smallest sum, whereas
    # the bottom-right point will have the largest sum
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    # now, compute the difference between the points, the
    # top-right point will have the smallest difference,
    # whereas the bottom-left will have the largest difference
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]

    return rect

def detect_corners(image_path):
    try:
        # Load image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")

        height, width = img.shape[:2]

        # Calculate a scale ratio to resize the image to a consistent width (e.g. 500px)
        # for more robust edge detection that isn't thrown off by massive megapixel noise
        ratio = width / 500.0
        new_width = 500
        new_height = int(height / ratio)
        
        resized = cv2.resize(img, (new_width, new_height))
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        
        # Bilateral Filtering preserves sharp paper edges while blurring noise (like wood grain)
        blurred = cv2.bilateralFilter(gray, 9, 75, 75)
        
        # Apply morphological operations to close small gaps in receipt edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        morphed = cv2.morphologyEx(blurred, cv2.MORPH_CLOSE, kernel)
        
        # Auto-Canny Edge Detection using median intensity
        v = np.median(morphed)
        sigma = 0.33
        lower = int(max(0, (1.0 - sigma) * v))
        upper = int(min(255, (1.0 + sigma) * v))
        edged = cv2.Canny(morphed, lower, upper)

        # Find contours
        contours, hierarchy = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Sort contours by area, largest first
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
        
        screen_cnt = None
        
        # Loop over contours to find a perfect 4-point polygon
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                screen_cnt = approx
                break
                
        # Extreme-Point Quadrilateral Forcing Fallback
        # If the receipt is crumpled and approxPolyDP gives 5+ points, we force a bounding quad!
        if screen_cnt is None and len(contours) > 0:
            largest_c = contours[0]
            pts = largest_c.reshape(-1, 2)
            
            if len(pts) >= 4:
                s = pts.sum(axis=1)
                diff = np.diff(pts, axis=1)
                
                tl = pts[np.argmin(s)]
                br = pts[np.argmax(s)]
                tr = pts[np.argmin(diff)]
                bl = pts[np.argmax(diff)]
                
                # Reshape into a fake 4-point contour array
                screen_cnt = np.array([tl, tr, br, bl], dtype="float32").reshape(4, 1, 2)
                
        if screen_cnt is None:
            # Fallback if no 4-point contour is found: use 12% margin inset
            inset = 0.12
            print(json.dumps([
                {"x": inset, "y": inset},
                {"x": 1.0 - inset, "y": inset},
                {"x": 1.0 - inset, "y": 1.0 - inset},
                {"x": inset, "y": 1.0 - inset}
            ]))
            return

        # Reshape to a flat list of 4 points, multiply by ratio to scale back to original
        pts = screen_cnt.reshape(4, 2) * ratio
        
        # Order them: TL, TR, BR, BL
        ordered = order_points(pts)
        
        # Normalize between 0.0 and 1.0 based on original dimensions
        normalized = []
        for pt in ordered:
            normalized.append({
                "x": float(pt[0] / width),
                "y": float(pt[1] / height)
            })
            
        print(json.dumps(normalized))

    except Exception as e:
        print("DETECT_ERROR", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python detect_corners.py <image_path>")
        sys.exit(1)
        
    image_path = sys.argv[1]
    detect_corners(image_path)
