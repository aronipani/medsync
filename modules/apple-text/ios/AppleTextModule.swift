import ExpoModulesCore
import ImageIO
import Vision

/// Reads printed text from a photo with Apple's Vision framework, on the phone.
/// Returns one entry per line in upright pixel coordinates (the photo's orientation flag applied),
/// top-left origin, with the line's four corners in reading order — the same shape as the ML Kit reader.
public class AppleTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleText")

    // words: optional list of the household's medicine words. When given, Vision's language correction is turned
    // on for this call with those words as its custom vocabulary (Vision ignores custom words without correction).
    // Used only for a second, "hint" reading of name areas (spec 15, section 2a); the raw reading stays uncorrected.
    AsyncFunction("recognize") { (uri: String, words: [String]?, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try AppleTextModule.recognize(uri, words: words ?? []))
        } catch {
          promise.reject("ERR_APPLE_TEXT", error.localizedDescription)
        }
      }
    }

    // How much a photo looks like each reference photo (spec 15, "look"): Vision's image feature print distance,
    // one per reference, in the same order (-1 where a reference can't be read). Smaller = more alike.
    // Used only to lift a weak read to amber ("check the name"); never for a green on its own.
    AsyncFunction("lookDistances") { (uri: String, refs: [String], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          promise.resolve(try AppleTextModule.lookDistances(uri, refs: refs))
        } catch {
          promise.reject("ERR_APPLE_LOOK", error.localizedDescription)
        }
      }
    }
  }

  static func loadImage(_ uri: String) throws -> (CGImage, CGImagePropertyOrientation) {
    let url: URL
    if uri.hasPrefix("file:") {
      guard let u = URL(string: uri) else { throw ReadError.badUri(uri) }
      url = u
    } else {
      url = URL(fileURLWithPath: uri)
    }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw ReadError.unreadable }
    var orientation = CGImagePropertyOrientation.up
    if let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
       let raw = props[kCGImagePropertyOrientation] as? UInt32,
       let o = CGImagePropertyOrientation(rawValue: raw) {
      orientation = o
    }
    return (image, orientation)
  }

  static func featurePrint(_ uri: String) throws -> VNFeaturePrintObservation {
    let (image, orientation) = try loadImage(uri)
    let request = VNGenerateImageFeaturePrintRequest()
    if #available(iOS 17.0, *) {
      request.revision = VNGenerateImageFeaturePrintRequestRevision2 // unit-length prints: distances about 0…2
    }
    request.imageCropAndScaleOption = .scaleFill
    try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])
    guard let print = request.results?.first as? VNFeaturePrintObservation else { throw ReadError.unreadable }
    return print
  }

  static func lookDistances(_ uri: String, refs: [String]) throws -> [String: Any] {
    let probe = try featurePrint(uri)
    var out: [Double] = []
    for ref in refs {
      do {
        let other = try featurePrint(ref)
        var d: Float = 0
        try probe.computeDistance(&d, to: other)
        out.append(Double(d))
      } catch {
        out.append(-1)
      }
    }
    var revision = 1
    if #available(iOS 17.0, *) { revision = 2 }
    return ["distances": out, "revision": revision]
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

  static func recognize(_ uri: String, words: [String]) throws -> [[String: Any]] {
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
    request.usesLanguageCorrection = !words.isEmpty // off by default: correction "fixes" brand names into dictionary words
    if !words.isEmpty { request.customWords = Array(words.prefix(500)) }
    request.minimumTextHeight = 0.008 // strips have small print; the default skips it

    try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])

    // Vision positions are 0…1 with the origin at the bottom left.
    func px(_ p: CGPoint) -> [String: Double] { ["x": Double(p.x) * w, "y": (1 - Double(p.y)) * h] }

    var out: [[String: Any]] = []
    for obs in request.results ?? [] {
      // Up to 3 candidate readings per line: the best, and Vision's own next guesses (worn letters often have one).
      let candidates = obs.topCandidates(3)
      guard let best = candidates.first else { continue }
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
        "alternatives": candidates.dropFirst()
          .map { $0.string.trimmingCharacters(in: .whitespacesAndNewlines) }
          .filter { !$0.isEmpty && $0 != text },
      ])
    }
    return out
  }
}
