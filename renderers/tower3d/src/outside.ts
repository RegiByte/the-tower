import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { skyAt, type Sky } from '../../../src/shared/design.ts'
import { pick, roll } from './avatar.ts'
import { random } from './random.ts'

/** The city around the tower: sky, lights, the street and a city of windows, lit by the viewer's clock. Built once. */

function windowTexture(seed: number) {
  const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 128 })
  const g = cv.getContext('2d')!
  g.fillStyle = '#0a0e18'
  g.fillRect(0, 0, 64, 128)
  let s = seed
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) {
    const r = rnd()
    g.fillStyle = r > 0.8 ? '#ffd27a' : r > 0.72 ? '#8ec9ff' : '#141b2c'
    g.fillRect(x, y, 4, 5)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function paintSky(cv: HTMLCanvasElement, look: Sky) {
  const g = cv.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, look.top)
  grad.addColorStop(0.55, look.mid)
  grad.addColorStop(1, look.horizon)
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 256)
}

/** The ground the airfield keeps clear of buildings, its approach and its climb-out: east of the ring road. */
const FIELD_CLEAR = { minX: 58, maxX: 88, minZ: -100, maxZ: 100 }

function city() {
  const group = new THREE.Group()
  const textures = [1, 2, 3, 4].map((i) => windowTexture(i * 7919))
  const byTexture: THREE.BufferGeometry[][] = textures.map(() => [])
  for (let i = 0; i < 90; i++) {
    const angle = (i / 90) * Math.PI * 2 + Math.sin(i * 12.9) * 0.2
    const dist = 95 + ((i * 37) % 80)
    const w = 10 + ((i * 13) % 14)
    const h = 16 + ((i * 29) % 70)
    const [x, z] = [Math.cos(angle) * dist, Math.sin(angle) * dist]
    if (x + w / 2 > FIELD_CLEAR.minX && x - w / 2 < FIELD_CLEAR.maxX && z + w / 2 > FIELD_CLEAR.minZ && z - w / 2 < FIELD_CLEAR.maxZ) continue
    const geo = new THREE.BoxGeometry(w, h, w)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 8), uv.getY(k) * (h / 16))
    geo.translate(x, h / 2, z)
    byTexture[i % 4].push(geo)
  }
  const windows = byTexture.map((geos, i) => {
    const mat = new THREE.MeshLambertMaterial({ color: '#2a3550', emissive: '#ffffff', emissiveMap: textures[i], emissiveIntensity: 0.5 })
    group.add(new THREE.Mesh(mergeGeometries(geos), mat))
    return mat
  })
  const pts: number[] = []
  for (let i = 0; i < 900; i++) {
    const a = random() * Math.PI * 2
    const e = 0.12 + random() * 1.3
    pts.push(Math.cos(a) * 380 * Math.cos(e), 380 * Math.sin(e), Math.sin(a) * 380 * Math.cos(e))
  }
  const stars = new THREE.BufferGeometry()
  stars.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const starMaterial = new THREE.PointsMaterial({ color: '#b8c8f0', size: 1.1, sizeAttenuation: false, fog: false, transparent: true })
  group.add(new THREE.Points(stars, starMaterial))
  return { group, windows, stars: starMaterial }
}

function street() {
  const g = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: '#10141e' }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.21
  g.add(ground)
  const lines: THREE.BufferGeometry[] = []
  for (let k = -6; k <= 6; k++) {
    const a = new THREE.BoxGeometry(800, 0.01, 0.15)
    a.translate(0, -0.2, k * 40)
    const b = new THREE.BoxGeometry(0.15, 0.01, 800)
    b.translate(k * 40, -0.2, 0)
    lines.push(a, b)
  }
  g.add(new THREE.Mesh(mergeGeometries(lines), new THREE.MeshBasicMaterial({ color: '#1e2a44' })))
  return { group: g, ground: ground.material }
}

const ROAD = { y: -0.17, width: 7, lane: 1.75, dash: 3, dashEvery: 9, steps: 400 }

/** The ring road around the block: a rounded rectangle, 42 m out in front and behind, 54 m to the sides, 57 m at the corners. */
function ringRoad() {
  const n = 24
  const corner = (c: number) => Math.sign(c) * Math.abs(c) ** 0.5
  const points = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return new THREE.Vector3(54 * corner(Math.cos(a)), ROAD.y, 42 * corner(Math.sin(a)))
  })
  return new THREE.CatmullRomCurve3(points, true, 'centripetal')
}

/** The two points `half` to each side of the road's centre line at arc length `s`. */
function across(curve: THREE.CatmullRomCurve3, length: number, s: number, half: number) {
  const u = (((s / length) % 1) + 1) % 1
  const p = curve.getPointAt(u)
  const t = curve.getTangentAt(u)
  const right = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(half)
  return [p.clone().sub(right), p.clone().add(right)]
}

/** A ribbon along the curve from `from` to `to` (arc lengths), `half` to each side, `lift` above the road, in `steps` quads. */
function ribbon(curve: THREE.CatmullRomCurve3, length: number, from: number, to: number, half: number, lift: number, steps: number, color: THREE.Color) {
  const positions: number[] = []
  const colors: number[] = []
  const index: number[] = []
  for (let k = 0; k <= steps; k++) {
    for (const v of across(curve, length, from + ((to - from) * k) / steps, half)) (positions.push(v.x, v.y + lift, v.z), colors.push(color.r, color.g, color.b))
    if (k < steps) index.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/** The road's asphalt and its centre dashes as one mesh; its colour is the daylight it is lit by. */
function roadway(curve: THREE.CatmullRomCurve3) {
  const length = curve.getLength()
  const asphalt = ribbon(curve, length, 0, length, ROAD.width / 2, 0, ROAD.steps, new THREE.Color('#2a2e36'))
  const dashes = Array.from({ length: Math.floor(length / ROAD.dashEvery) }, (_, k) =>
    ribbon(curve, length, k * ROAD.dashEvery, k * ROAD.dashEvery + ROAD.dash, 0.08, 0.02, 1, new THREE.Color('#7a705a')))
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  return { mesh: new THREE.Mesh(mergeGeometries([asphalt, ...dashes]), material), material }
}

/** `geo` painted in one colour, for meshes that merge many colours into one draw. */
function painted(geo: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color)
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: geo.getAttribute('position').count }, () => [c.r, c.g, c.b]).flat(), 3))
  return geo
}

const CAR = { length: 4.2, width: 1.9 }
const CAR_COLORS = ['#a8473d', '#3e6496', '#cfc8b8', '#2b2f38', '#6f7d55', '#bf9a48', '#56697a', '#7e4862', '#d7d9dc', '#45505c']
const PER_LANE = 8
/** Each lane's speed in m/s, and how far (m) a car drifts ahead of or behind its place in the lane's convoy. */
const LANES = [{ speed: 10, drift: 7 }, { speed: 12.5, drift: 7 }]

/** A car's parts around its origin on the road, facing +z: its body, its cabin and its lamps (white ahead, red behind). */
function carParts() {
  const body = new THREE.BoxGeometry(CAR.width, 0.7, CAR.length).translate(0, 0.5, 0)
  const cabin = new THREE.BoxGeometry(CAR.width - 0.25, 0.55, 2.2).translate(0, 1.12, -0.3)
  const lamp = (x: number, z: number, color: string) => painted(new THREE.PlaneGeometry(0.38, 0.16).rotateY(z > 0 ? 0 : Math.PI).translate(x, 0.62, z), color)
  const front = CAR.length / 2 + 0.01
  const lamps = mergeGeometries([lamp(-0.62, front, '#fff4d6'), lamp(0.62, front, '#fff4d6'), lamp(-0.62, -front, '#ff3a2a'), lamp(0.62, -front, '#ff3a2a')])
  return { body, cabin, lamps }
}

/**
 * The traffic on the ring road: two lanes of cars driving on the right, each lane a convoy at its own speed whose cars
 * drift a little ahead and back, never into each other. Where every car is follows from the sim clock alone.
 */
function traffic(curve: THREE.CatmullRomCurve3) {
  const length = curve.getLength()
  const count = PER_LANE * LANES.length
  const parts = carParts()
  const lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  const meshes = [
    new THREE.InstancedMesh(parts.body, new THREE.MeshLambertMaterial(), count),
    new THREE.InstancedMesh(parts.cabin, new THREE.MeshLambertMaterial({ color: '#1b2230' }), count),
    new THREE.InstancedMesh(parts.lamps, lampMaterial, count),
  ]
  const cars = Array.from({ length: count }, (_, i) => {
    const id = `car${i}`
    const lane = i % LANES.length
    const place = Math.floor(i / LANES.length)
    meshes[0].setColorAt(i, new THREE.Color(pick(CAR_COLORS, roll(id, 'colour'))))
    return {
      lane,
      at: ((place + (roll(id, 'gap') - 0.5) * 0.2) * length) / PER_LANE,
      drift: { rate: 0.05 + roll(id, 'drift rate') * 0.07, phase: roll(id, 'drift phase') * Math.PI * 2 },
    }
  })
  for (const m of meshes) (m.frustumCulled = false, m.instanceMatrix.setUsage(THREE.DynamicDrawUsage))
  const group = new THREE.Group().add(...meshes)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const scale = new THREE.Vector3(1, 1, 1)
  const position = new THREE.Vector3()
  const heading = new THREE.Vector3()
  const right = new THREE.Vector3()
  const tick = (t: number) => {
    cars.forEach((car, i) => {
      const { speed, drift } = LANES[car.lane]
      const s = car.at + speed * t + drift * Math.sin(car.drift.rate * t + car.drift.phase)
      const forward = (((s / length) % 1) + 1) % 1
      const u = car.lane === 0 ? forward : 1 - forward
      curve.getTangentAt(u, heading).multiplyScalar(car.lane === 0 ? 1 : -1)
      curve.getPointAt(u, position).addScaledVector(right.set(-heading.z, 0, heading.x), ROAD.lane)
      quaternion.setFromAxisAngle(up, Math.atan2(heading.x, heading.z))
      matrix.compose(position, quaternion, scale)
      for (const m of meshes) m.setMatrixAt(i, matrix)
    })
    for (const m of meshes) m.instanceMatrix.needsUpdate = true
  }
  return { group, lamps: lampMaterial, tick }
}

/**
 * The airfield east of the ring road: a runway along z at x 78 from z −55 to 55, taking off toward −z, and a taxiway
 * between it and the road joined to both of its ends.
 */
const RUNWAY = { x: 78, from: -55, to: 55, width: 8 }
const TAXIWAY = { x: 66, width: 5, ends: [-40, 56] }
const FIELD = { minX: 61, maxX: 86, minZ: -62, maxZ: 64, y: -0.15 }

/** A flat quad over x0..x1, z0..z1 at height y, in one colour. */
const patch = (x0: number, x1: number, z0: number, z1: number, y: number, color: string) =>
  painted(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2), color)

/** The field's grass, its paving and its markings as one mesh, and its lights as another: edges warm, the ends green and red. */
function airfield() {
  const { x, from, to, width } = RUNWAY
  const half = width / 2
  const paving = [
    patch(FIELD.minX, FIELD.maxX, FIELD.minZ, FIELD.maxZ, FIELD.y - 0.035, '#3a4a3c'),
    patch(x - half, x + half, from, to, FIELD.y, '#2a2e36'),
    patch(TAXIWAY.x - TAXIWAY.width / 2, TAXIWAY.x + TAXIWAY.width / 2, TAXIWAY.ends[0] - TAXIWAY.width / 2, TAXIWAY.ends[1] + TAXIWAY.width / 2, FIELD.y, '#2a2e36'),
    ...TAXIWAY.ends.map((z) => patch(TAXIWAY.x, x - half, z - TAXIWAY.width / 2, z + TAXIWAY.width / 2, FIELD.y, '#2a2e36')),
  ]
  const markings = [
    ...Array.from({ length: Math.floor((to - from - 20) / 10) }, (_, k) => patch(x - 0.15, x + 0.15, from + 12 + k * 10, from + 16 + k * 10, FIELD.y + 0.02, '#8a8676')),
    ...[from + 2, to - 6].flatMap((z) => [-3, -2, -1, 1, 2, 3].map((k) => patch(x + k * 1.05 - 0.3, x + k * 1.05 + 0.3, z, z + 4, FIELD.y + 0.02, '#8a8676'))),
  ]
  const ground = new THREE.MeshLambertMaterial({ vertexColors: true })
  const lamp = (lx: number, lz: number, color: string) => painted(new THREE.BoxGeometry(0.5, 0.4, 0.5).translate(lx, FIELD.y + 0.2, lz), color)
  const lamps = [
    ...Array.from({ length: (to - from) / 10 + 1 }, (_, k) => from + k * 10).flatMap((z) => [
      ...(TAXIWAY.ends.some((end) => Math.abs(z - end) < TAXIWAY.width) ? [] : [lamp(x - half - 0.6, z, '#ffe2a8')]),
      lamp(x + half + 0.6, z, '#ffe2a8'),
    ]),
    ...[-3, -1.5, 0, 1.5, 3].flatMap((k) => [lamp(x + k, to + 1, '#5cff8a'), lamp(x + k, from - 1, '#ff3a2a')]),
  ]
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true })
  const group = new THREE.Group().add(new THREE.Mesh(mergeGeometries([...paving, ...markings]), ground), new THREE.Mesh(mergeGeometries(lamps), lights))
  return { group, ground, lights }
}

/**
 * The plane's round, as points along its path (x, alt, z) with the speed (m/s) it passes each at: holding at the
 * runway's south end, its roll and climb-out toward −z, two left-hand laps around the tower inside the city, the first
 * climbing to 80 m, the second coming down, then an approach from +z, the landing, and the taxi back along the
 * taxiway. It keeps 60 m or more from the tower, so it never comes between the roof and its big screen.
 */
const ROUND: { at: [number, number, number]; speed: number; hold?: number }[] = [
  { at: [78, 0, 50], speed: 0, hold: 12 },
  { at: [78, 0, 28], speed: 14 },
  { at: [78, 0, 4], speed: 22 },
  { at: [78, 1, -20], speed: 24 },
  { at: [76, 5, -44], speed: 24 },
  { at: [64, 13, -63], speed: 23 },
  { at: [36, 26, -70], speed: 22 },
  { at: [0, 40, -70], speed: 22 },
  { at: [-40, 52, -60], speed: 22 },
  { at: [-66, 62, -25], speed: 22 },
  { at: [-66, 70, 20], speed: 22 },
  { at: [-45, 76, 55], speed: 22 },
  { at: [-5, 80, 70], speed: 22 },
  { at: [35, 80, 66], speed: 22 },
  { at: [66, 78, 40], speed: 22 },
  { at: [72, 76, 0], speed: 22 },
  { at: [62, 72, -45], speed: 22 },
  { at: [36, 67, -68], speed: 22 },
  { at: [0, 61, -70], speed: 22 },
  { at: [-40, 55, -60], speed: 22 },
  { at: [-66, 49, -25], speed: 22 },
  { at: [-66, 42, 20], speed: 22 },
  { at: [-45, 35, 55], speed: 22 },
  { at: [-5, 28, 68], speed: 22 },
  { at: [30, 19, 72], speed: 21 },
  { at: [56, 11, 70], speed: 21 },
  { at: [72, 6, 62], speed: 20 },
  { at: [78, 2, 46], speed: 20 },
  { at: [78, 0, 28], speed: 19 },
  { at: [78, 0, 0], speed: 11 },
  { at: [78, 0, -28], speed: 6 },
  { at: [74, 0, -40], speed: 5 },
  { at: [66, 0, -34], speed: 6 },
  { at: [66, 0, 0], speed: 8 },
  { at: [66, 0, 40], speed: 7 },
  { at: [67, 0, 51], speed: 5 },
  { at: [70, 0, 55.5], speed: 4 },
  { at: [75, 0, 54.5], speed: 3 },
  { at: [77.5, 0, 53], speed: 2 },
]
const PLANE = { prop: 30, strobe: { rate: 8, every: 10 }, bank: 0.5, g: 9.8, look: 4 }

/**
 * Where the plane is over its round: the path through `ROUND` and, per leg between two of its points, when it starts
 * and how long it lasts, the speed changing evenly from one point's to the next's. A hold is a leg standing still.
 */
function route() {
  const n = ROUND.length
  const curve = new THREE.CatmullRomCurve3(ROUND.map((p) => new THREE.Vector3(...p.at)), true, 'centripetal')
  curve.arcLengthDivisions = n * 40
  const lengths = curve.getLengths()
  const legs: { t: number; dt: number; s: number; v: number; a: number }[] = []
  let t = 0
  ROUND.forEach((p, i) => {
    const s = lengths[i * 40]
    if (p.hold) (legs.push({ t, dt: p.hold, s, v: 0, a: 0 }), (t += p.hold))
    const next = ROUND[(i + 1) % n]
    const ds = (i + 1 < n ? lengths[(i + 1) * 40] : curve.getLength()) - s
    const dt = (2 * ds) / (p.speed + next.speed)
    legs.push({ t, dt, s, v: p.speed, a: (next.speed - p.speed) / dt })
    t += dt
  })
  const period = t
  const length = curve.getLength()
  /** How far along the path (m) the plane is at sim time `time`, and how fast it goes (m/s). */
  const along = (time: number) => {
    const at = ((time % period) + period) % period
    let leg = legs[0]
    for (const l of legs) if (l.t <= at) leg = l
    const u = at - leg.t
    return { s: (leg.s + leg.v * u + (leg.a * u * u) / 2) % length, speed: leg.v + leg.a * u }
  }
  return { curve, length, period, along }
}

/** The plane flying its round, posed from the sim clock alone: banked into its turns, its prop turning, its strobes flashing. */
function flight(model: THREE.Group) {
  const plane = model.clone(true)
  plane.rotation.order = 'YXZ'
  const prop = plane.getObjectByName('prop')!
  const strobe = plane.getObjectByName('strobe')!
  const { curve, length, along } = route()
  const point = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const behind = new THREE.Vector3()
  const tick = (t: number) => {
    const { s, speed } = along(t)
    const u = s / length
    curve.getPointAt(u, point)
    curve.getTangentAt(u, ahead)
    curve.getTangentAt((((s - PLANE.look) / length) % 1 + 1) % 1, behind)
    const turn = Math.atan2(ahead.x, ahead.z) - Math.atan2(behind.x, behind.z)
    const yawRate = (Math.atan2(Math.sin(turn), Math.cos(turn)) / PLANE.look) * speed
    const airborne = THREE.MathUtils.clamp(point.y / 3, 0, 1)
    plane.position.set(point.x, FIELD.y + Math.max(0, point.y), point.z)
    plane.rotation.set(-Math.asin(ahead.y) * airborne, Math.atan2(ahead.x, ahead.z), -THREE.MathUtils.clamp(Math.atan((speed * yawRate) / PLANE.g), -PLANE.bank, PLANE.bank) * airborne)
    prop.rotation.z = t * PLANE.prop
    strobe.visible = Math.floor(t * PLANE.strobe.rate) % PLANE.strobe.every === 0
  }
  return { plane, tick }
}

const NIGHT = { stone: new THREE.Color('#2a3550'), ground: new THREE.Color('#10141e') }
const DAY = { stone: new THREE.Color('#8f9bb5'), ground: new THREE.Color('#3a4150') }

/**
 * Builds the outside into the scene: `setHour` sets it to an hour of the day (0–24), `tick` moves what drives and
 * flies around it to sim time `t` (seconds), and `fly` puts the plane (models/plane.py) on the airfield once the
 * models are loaded.
 */
export function outside(scene: THREE.Scene) {
  const sky = Object.assign(document.createElement('canvas'), { width: 4, height: 256 })
  const background = new THREE.CanvasTexture(sky)
  background.colorSpace = THREE.SRGBColorSpace
  scene.background = background
  const fog = new THREE.Fog('#0c1430', 120, 420)
  scene.fog = fog
  const hemi = new THREE.HemisphereLight('#b9c8ff', '#2a2430', 1.9)
  const sun = new THREE.DirectionalLight('#dfe6ff', 1.6)
  sun.position.set(-40, 80, 60)
  scene.add(hemi, sun, new THREE.AmbientLight('#ffffff', 0.35))
  const town = city()
  const road = street()
  const curve = ringRoad()
  const ring = roadway(curve)
  const cars = traffic(curve)
  cars.tick(0)
  const field = airfield()
  scene.add(road.group, town.group, ring.mesh, cars.group, field.group)
  let flying: ReturnType<typeof flight> | undefined
  const fly = (model: THREE.Group) => {
    flying = flight(model)
    field.group.add(flying.plane)
  }
  const tick = (t: number) => {
    cars.tick(t)
    flying?.tick(t)
  }
  const setHour = (hours: number) => {
    const look = skyAt(hours)
    paintSky(sky, look)
    background.needsUpdate = true
    fog.color.set(look.mid)
    hemi.intensity = 1.9 * look.light
    sun.intensity = 1.6 * look.light
    sun.color.set(look.stars > 0.5 ? '#dfe6ff' : '#fff1dc')
    town.stars.opacity = look.stars
    const day = THREE.MathUtils.clamp(look.light - 1, 0, 1)
    for (const w of town.windows) (w.emissiveIntensity = look.windows, w.color.copy(NIGHT.stone).lerp(DAY.stone, day))
    road.ground.color.copy(NIGHT.ground).lerp(DAY.ground, day)
    ring.material.color.setScalar(0.55 + 0.45 * day)
    cars.lamps.color.setScalar(THREE.MathUtils.clamp(2 - look.light, 0.15, 1))
    field.ground.color.setScalar(0.55 + 0.45 * day)
    field.lights.color.setScalar(THREE.MathUtils.clamp(2 - look.light, 0.15, 1))
  }
  return { setHour, tick, fly }
}
