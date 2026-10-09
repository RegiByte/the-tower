// The tower the app shows: the system the config `tower app` wrote into the Info.plist names, started apart from the
// app (`tower up` in a terminal), so the daemons and every session under them stay the starter's, never the app's.

import Foundation

/** The config this build serves, from its Info.plist. */
struct Tower {
  let config: String

  static let bundled = Tower(config: Bundle.main.object(forInfoDictionaryKey: "TowerConfig") as! String)

  /** The tower's address: the config's `port`, 4317 when left out (`towerPort`, src/shared/model.ts). */
  func url() throws -> URL {
    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: config))) as! [String: Any]
    return URL(string: "http://127.0.0.1:\((json["port"] as? Int) ?? 4317)/")!
  }

  /** What starts this system from a terminal: `tower up`, naming the config when it isn't the default one. */
  var upCommand: String {
    config == NSHomeDirectory() + "/.tower/config.json" ? "tower up" : "TOWER_CONFIG=\(config) tower up"
  }
}

/** Whether the tower at `home` answers, heard on the main queue. */
func ask(_ home: URL, _ done: @escaping (Bool) -> Void) {
  URLSession.shared.dataTask(with: home.appendingPathComponent("renderers")) { _, response, _ in
    let up = (response as? HTTPURLResponse)?.statusCode == 200
    DispatchQueue.main.async { done(up) }
  }.resume()
}
