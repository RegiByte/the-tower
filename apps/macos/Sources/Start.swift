// Bringing the tower up from an app: a Finder-launched app has launchd's bare environment, so the `tower` command runs
// with the user's login shell environment, the one a terminal would give it (PATH to node, the locale), and the
// config `tower app` wrote into the Info.plist.

import Foundation

/** The checkout and the config this build serves, from its Info.plist. */
struct Tower {
  let checkout: String
  let config: String

  static let bundled = Tower(
    checkout: Bundle.main.object(forInfoDictionaryKey: "TowerCheckout") as! String,
    config: Bundle.main.object(forInfoDictionaryKey: "TowerConfig") as! String
  )

  var command: String { checkout + "/src/mod/bin/tower" }

  /** The tower's address: the config's `port`, 4317 when left out (`towerPort`, src/shared/model.ts). */
  func url() throws -> URL {
    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: config))) as! [String: Any]
    return URL(string: "http://127.0.0.1:\((json["port"] as? Int) ?? 4317)/")!
  }
}

struct Ran {
  let status: Int32
  let output: String
}

/**
 * Runs a program to its end, its stdout and stderr together; a `limit` in seconds ends it early. The output goes to a
 * file, read once the program ends: something it left in the background (a login shell's update check) may hold the
 * output open for good, and a pipe would wait for it.
 */
func run(_ executable: String, _ arguments: [String], env: [String: String]? = nil, limit: TimeInterval? = nil) throws -> Ran {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: executable)
  process.arguments = arguments
  if let env { process.environment = env }
  let file = FileManager.default.temporaryDirectory.appendingPathComponent("tower-app-\(UUID().uuidString).out")
  FileManager.default.createFile(atPath: file.path, contents: nil)
  defer { try? FileManager.default.removeItem(at: file) }
  let out = try FileHandle(forWritingTo: file)
  process.standardOutput = out
  process.standardError = out
  process.standardInput = FileHandle.nullDevice
  try process.run()
  try out.close()
  if let limit { DispatchQueue.global().asyncAfter(deadline: .now() + limit) { if process.isRunning { process.terminate() } } }
  process.waitUntilExit()
  return Ran(status: process.terminationStatus, output: String(decoding: try Data(contentsOf: file), as: UTF8.self))
}

struct StartFailure: Error {
  let title: String
  let detail: String
}

private let MARK = "__TOWER_APP_ENV__"

/**
 * The user's login shell environment: an interactive login shell, so whatever its rc files put on the PATH (nvm,
 * Homebrew) is there. What the rc files print comes before the mark and is dropped.
 */
func loginEnvironment() throws -> [String: String] {
  let shell = String(cString: getpwuid(getuid())!.pointee.pw_shell)
  let ran = try run(shell, ["-ilc", "printf '\\0\(MARK)\\0'; /usr/bin/env -0"], limit: 20)
  let parts = ran.output.split(separator: "\0", omittingEmptySubsequences: false).map(String.init)
  guard let at = parts.firstIndex(of: MARK) else {
    throw StartFailure(title: "Your login shell gave no environment", detail: "\(shell) -ilc exited \(ran.status):\n\n\(ran.output)")
  }
  var env: [String: String] = [:]
  for part in parts[(at + 1)...] {
    guard let eq = part.firstIndex(of: "=") else { continue }
    env[String(part[..<eq])] = String(part[part.index(after: eq)...])
  }
  return env
}

/** `tower up` for this build's system, then its address; a failure carries `tower doctor`'s verdicts. */
func startTower(_ tower: Tower) throws -> URL {
  var env = try loginEnvironment()
  env["TOWER_CONFIG"] = tower.config
  let up = try run(tower.command, ["up"], env: env)
  if up.status != 0 {
    let doctor = try run(tower.command, ["doctor"], env: env)
    throw StartFailure(title: "tower up failed", detail: "$ tower up\n\(up.output)\n$ tower doctor\n\(doctor.output)")
  }
  return try tower.url()
}
