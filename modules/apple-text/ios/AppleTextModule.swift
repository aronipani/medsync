import ExpoModulesCore
import ImageIO
import Vision

/// Reads printed text from a photo with Apple's Vision framework, on the phone.
/// Returns one entry per line in upright pixel coordinates (the photo's orientation flag applied),
/// top-left origin, with the line's four corners in reading order — the same shape as the ML Kit reader.
public class AppleTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleText")

    AsyncFunction("recognize") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try AppleTextModule.recognize(uri))
        } catch {
          promise.reject("ERR_APPLE_TEXT", error.localizedDescription)
        }
      }
    }
  }

  enum ReadError: LocalizedError {
    case badUri(String), unreadable
    var errorDescription: String? {
      switch self {
      case .badUri(let u): return "Not a file: \(u)"
      case .unreadable: return "Could not open the photo"
      }
    }
  }

  static func recognize(_ uri: String) throws -> [[String: Any]] {
    let url: URL
    if uri.hasPrefix("file:") {
      guard let u = URL(string: uri) else { throw ReadError.badUri(uri) }
      url = u
    } else {
      url = URL(fileURLWithPath: uri)
    }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw ReadError.unreadable }

    // Camera photos are often stored sideways with a "rotate when shown" flag. Passing it to Vision makes the
    // normalised positions upright, so the size used to turn them into pixels is the upright size too.
    var orientation = CGImagePropertyOrientation.up
    if let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
       let raw = props[kCGImagePropertyOrientation] as? UInt32,
       let o = CGImagePropertyOrientation(rawValue: raw) {
      orientation = o
    }
    let sideways: [CGImagePropertyOrientation] = [.left, .leftMirrored, .right, .rightMirrored]
    let w = Double(sideways.contains(orientation) ? image.height : image.width)
    let h = Double(sideways.contains(orientation) ? image.width : image.height)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false // correction "fixes" brand names into dictionary words
    request.minimumTextHeight = 0.008 // strips have small print; the default skips it

    try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])

    // Vision positions are 0…1 with the origin at the bottom left.
    func px(_ p: CGPoint) -> [String: Double] { ["x": Double(p.x) * w, "y": (1 - Double(p.y)) * h] }

    var out: [[String: Any]] = []
    for obs in request.results ?? [] {
      guard let best = obs.topCandidates(1).first else { continue }
      let text = best.string.trimmingCharacters(in: .whitespacesAndNewlines)
      if text.isEmpty { continue }
      let b = obs.boundingBox
      out.append([
        "text": text,
        "left": Double(b.minX) * w,
        "top": (1 - Double(b.maxY)) * h,
        "width": Double(b.width) * w,
        "height": Double(b.height) * h,
        "corners": [px(obs.topLeft), px(obs.topRight), px(obs.bottomRight), px(obs.bottomLeft)],
        "confidence": Double(best.confidence),
      ])
    }
    return out
  }
}
