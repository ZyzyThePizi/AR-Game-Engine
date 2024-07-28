import tensorflow as tf
import tensorflow_hub as hub
import numpy as np
import cv2
import imageio

# Load the MoveNet model from TensorFlow Hub
movenet = hub.load("https://tfhub.dev/google/movenet/singlepose/thunder/4")

# Define the mapping of keypoints to body parts
keypoint_names = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear', 'left_shoulder', 'right_shoulder',
                  'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
                  'left_knee', 'right_knee', 'left_ankle', 'right_ankle']

# Define the connections between keypoints to draw lines for visualization
connections = [(0, 1), (0, 2), (1, 3), (2, 4), (0, 5), (0, 6), (5, 7), (7, 9), (6, 8), (8, 10),
               (5, 6), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14), (14, 16)]

# Function to perform pose detection on an image sequence or GIF
def detect_pose_sequence_of(gif_path):
     # Load the GIF
    gif = cv2.VideoCapture(gif_path)
    frames = []
    # Read frames from the GIF
    while True:
        ret, frame = gif.read()
        if not ret:
            break
        frames.append(frame)
    # Initialize an empty list to store keypoints for each frame
    all_keypoints = []
    # Iterate through each frame
    for frame in frames:
        # Convert frame to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        # Resize frame to the expected input size of MoveNet
        frame_resized = tf.image.resize_with_pad(tf.expand_dims(frame_rgb, axis=0), 256, 256) # 256 for thunder
        # Convert the resized frame tensor to a NumPy array with dtype uint8
        frame_np = frame_resized.numpy().astype(np.int32)
        # Perform inference
        outputs = movenet.signatures["serving_default"](tf.constant(frame_np))
        # Extract the keypoints
        keypoints = outputs['output_0'].numpy()
        # Append keypoints to the list
        all_keypoints.append(keypoints)
    # Return keypoints for all frames
    return all_keypoints

# Function to visualize keypoints on an image sequence or GIF and create a new GIF
def visualize_and_create_pose_sequence(gif_path, keypoints_list, output_gif_path, default_fps=10):
    # Load the GIF
    gif = imageio.get_reader(gif_path)
    # Initialize list to store frames with keypoints overlay
    frames_with_keypoints = []
    # Loop through each frame and its corresponding keypoints
    for frame_index, (frame, keypoints) in enumerate(zip(gif, keypoints_list)):
        # Convert keypoints to numpy array
        keypoints = np.array(keypoints)
        # Ensure keypoints array has the expected shape
        if keypoints.shape == (1, 1, 17, 3):
            # Extract keypoints from the array
            keypoints = keypoints[0, 0]
            # Loop through each keypoint
            for kp_index, kp in enumerate(keypoints):
                # Extract x and y coordinates of the keypoint
                x = int(kp[1] * frame.shape[1])
                y = int(kp[0] * frame.shape[0])
                # Check if the keypoint is critical
                if keypoint_names[kp_index] in ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear']:
                    # Calculate the average position of neighboring keypoints
                    neighbor_indices = [c for c in connections if kp_index in c]
                    neighbor_positions = []
                    for connection in neighbor_indices:
                        neighbor_kp_index = connection[0] if connection[1] == kp_index else connection[1]
                        neighbor_positions.append(keypoints[neighbor_kp_index])
                    neighbor_positions = np.array(neighbor_positions)
                    average_x = int(np.mean(neighbor_positions[:, 1]) * frame.shape[1])
                    average_y = int(np.mean(neighbor_positions[:, 0]) * frame.shape[0])
                    # Update the position of the critical keypoint
                    x = average_x
                    y = average_y
                # Draw a circle at the adjusted keypoint position
                cv2.circle(frame, (x, y), 4, (255, 0, 0), -1)  # Increase thickness and change color to blue
            # Draw lines connecting keypoints
            for connection in connections:
                start_point = (int(keypoints[connection[0], 1] * frame.shape[1]),
                               int(keypoints[connection[0], 0] * frame.shape[0]))
                end_point = (int(keypoints[connection[1], 1] * frame.shape[1]),
                             int(keypoints[connection[1], 0] * frame.shape[0]))
                cv2.line(frame, start_point, end_point, (0, 0, 255), 1)  # Increase thickness and change color to red
            # Append the frame with keypoints overlay to the list
            frames_with_keypoints.append(frame)
        else:
            print("Unexpected shape of keypoints array for frame", frame_index + 1)
    # Remove the last frame if it's a black frame
    if np.all(frames_with_keypoints[-1] == [0, 0, 0]):
        frames_with_keypoints.pop()
    # Get the frame rate from the metadata if available, otherwise use the default frame rate
    try:
        fps = gif.get_meta_data()['fps']
    except KeyError:
        fps = default_fps
    # Save the frames with keypoints overlay as a new GIF
    imageio.mimsave(output_gif_path, frames_with_keypoints, fps=fps)

input_gif_path = "dance.gif"  # Replace with the path to your input GIF
output_gif_path = "dance2.gif"  # Path to save the new GIF with keypoints overlay
sequence_keypoints = detect_pose_sequence_of(input_gif_path)
visualize_and_create_pose_sequence(input_gif_path, sequence_keypoints, output_gif_path)