// droidwire-thumb: writes a JPEG poster frame for a video using AVFoundation.
//
//   droidwire-thumb <video-url-or-path> <output.jpg> [max-width]
//
// Exit status: 0 success; 2 usage; 3 the video could not be decoded (format or
// codec AVFoundation does not support, unreadable stream, no video track).
//
// The input may be an http(s) URL. AVFoundation then issues range requests, so
// Droidwire can point it at its loopback range server and only the bytes needed
// for the poster frame (including a moov atom at the end of the file) cross USB.
//
// MIT licensed, part of Droidwire. Uses only macOS system frameworks.
import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ code: Int32, _ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(code)
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail(2, "usage: droidwire-thumb <video-url-or-path> <output.jpg> [max-width]") }

let input = args[1]
let outputPath = args[2]
let maxWidth = args.count > 3 ? (Double(args[3]) ?? 320) : 320

let url: URL
if input.contains("://"), let parsed = URL(string: input) {
    url = parsed
} else {
    url = URL(fileURLWithPath: input)
}

let asset = AVURLAsset(url: url)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: maxWidth, height: maxWidth)
generator.requestedTimeToleranceBefore = .positiveInfinity
generator.requestedTimeToleranceAfter = .positiveInfinity

let semaphore = DispatchSemaphore(value: 0)
var result: CGImage?
var failure: String = "no frame produced"

// Poster frame: one second in, or the midpoint of very short clips.
// (The duration load is synchronous here on purpose: this is a one-shot tool.)
let duration = CMTimeGetSeconds(asset.duration)
let seconds = duration.isFinite && duration > 0 ? min(1.0, duration / 2) : 0
let time = NSValue(time: CMTime(seconds: seconds, preferredTimescale: 600))

generator.generateCGImagesAsynchronously(forTimes: [time]) { _, image, _, status, error in
    if status == .succeeded, let image = image {
        result = image
    } else if let error = error {
        failure = error.localizedDescription
    }
    semaphore.signal()
}
semaphore.wait()

guard let image = result else { fail(3, "could not decode video: \(failure)") }

let outURL = URL(fileURLWithPath: outputPath)
guard let destination = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
    fail(3, "could not create \(outputPath)")
}
CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
guard CGImageDestinationFinalize(destination) else { fail(3, "could not write JPEG") }
