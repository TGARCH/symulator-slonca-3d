"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import proj4 from "proj4";


const EPSG2180 =
  "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs";
const START = {
  lat: 50.1711725338,
  lon: 18.8873064393,
  e: 491954.71,
  n: 256000.84,
  address: "Mikołów, Fabryczna 11",
};
const rad = Math.PI / 180;
type Loc = typeof START;
type LayerKey = "ortho" | "egib" | "gesut" | "bdot";


function sunPosition(date: Date, lat: number, lon: number) {
  const d = date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545,
    M = rad * (357.5291 + 0.98560028 * d),
    C =
      rad *
      (1.9148 * Math.sin(M) +
        0.02 * Math.sin(2 * M) +
        0.0003 * Math.sin(3 * M)),
    L = M + C + rad * 102.9372 + Math.PI,
    e = rad * 23.4397,
    dec = Math.asin(Math.sin(e) * Math.sin(L)),
    ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L)),
    H = rad * (280.16 + 360.9856235 * d) + lon * rad - ra,
    p = lat * rad;
  return {
    alt: Math.asin(
      Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H),
    ),
    az: Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(p) - Math.tan(dec) * Math.cos(p),
    ),
  };
}
function polishDate(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number),
    [hour, minute] = time.split(":").map(Number),
    probe = new Date(Date.UTC(year, month - 1, day, hour, minute)),
    zone = new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Warsaw",
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((part) => part.type === "timeZoneName")?.value,
    match = zone?.match(/GMT([+-])(\d{2}):(\d{2})/),
    offset = match
      ? (match[1] === "+" ? 1 : -1) * (+match[2] * 60 + +match[3])
      : 60;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offset * 60000);
}
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  m: THREE.Material,
) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}
function demo(scene: THREE.Scene) {
  const g = new THREE.Group(),
    w = new THREE.MeshStandardMaterial({ color: 0xe9e1d5, roughness: 0.8 });
  g.add(
    box(
      12,
      0.16,
      8,
      0,
      0.08,
      0,
      new THREE.MeshStandardMaterial({ color: 0x98765b }),
    ),
    box(0.22, 3.2, 8, -6, 1.6, 0, w),
    box(0.22, 3.2, 8, 6, 1.6, 0, w),
    box(12, 3.2, 0.22, 0, 1.6, 4, w),
    box(1.3, 3.2, 0.22, -5.35, 1.6, -4, w),
    box(1.3, 3.2, 0.22, 5.35, 1.6, -4, w),
    box(1.2, 3.2, 0.22, -1.9, 1.6, -4, w),
    box(1.2, 3.2, 0.22, 1.9, 1.6, -4, w),
    box(2.25, 0.55, 0.22, -3.75, 2.92, -4, w),
    box(2.25, 0.55, 0.22, 3.75, 2.92, -4, w),
    box(0.15, 2.6, 5, 0, 1.3, 0.7, w),
  );
  scene.add(g);
  return g;
}


export default function Page() {
  const host = useRef<HTMLDivElement>(null),
    api = useRef<any>(null),
    pickRef = useRef(false);
  const [loc, setLoc] = useState<Loc>(START),
    [mapSize, setMapSize] = useState(250),
    [mode, setMode] = useState<"address" | "xy" | "gps">("address"),
    [address, setAddress] = useState(START.address),
    [x, setX] = useState(START.n.toFixed(2)),
    [y, setY] = useState(START.e.toFixed(2)),
    [gps, setGps] = useState("50.16545019801309, 18.9081535705677"),
    [status, setStatus] = useState(""),
    [pick, setPick] = useState(false),
    [layers, setLayers] = useState<Record<LayerKey, boolean>>({
      ortho: true,
      egib: true,
      gesut: false,
      bdot: false,
    }),
    [layerOpacity, setLayerOpacity] = useState(0.82),
    [time, setTime] = useState("12:00"),
    [date, setDate] = useState("2026-06-21"),
    [dateDraft, setDateDraft] = useState("2026-06-21"),
    [play, setPlay] = useState(false),
    [shadowStudy, setShadowStudy] = useState(false),
    [panel, setPanel] = useState(true),
    [model, setModel] = useState("Dom testowy"),
    [solar, setSolar] = useState({ alt: 0, az: 0 });
  pickRef.current = pick;
  const applyLoc = (next: Loc) => {
    setLoc(next);
    setAddress(next.address);
    setX(next.n.toFixed(2));
    setY(next.e.toFixed(2));
    setStatus("");
    setPick(false);
  };


  useEffect(() => {
    if (!host.current) return;
    const h = host.current,
      s = new THREE.Scene();
    s.background = new THREE.Color(0xa8c8dd);
    const cam = new THREE.PerspectiveCamera(
      62,
      h.clientWidth / h.clientHeight,
      0.05,
      1200,
    );
    cam.position.set(0, 180, 0.01);
    const r = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    r.setSize(h.clientWidth, h.clientHeight);
    r.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    h.appendChild(r.domElement);
    const hemi = new THREE.HemisphereLight(0xe5f2ff, 0x4a5546, 0.72),
      sun = new THREE.DirectionalLight(0xfff3d8, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.far = 300;
    s.add(hemi, sun, sun.target);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0xf4f3ef,
        roughness: 1,
      }),
      baseMesh = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), baseMat),
      layerKeys: LayerKey[] = ["ortho", "bdot", "egib", "gesut"],
      mapMeshes = {} as Record<LayerKey, THREE.Mesh>,
      mapMats = {} as Record<LayerKey, THREE.MeshStandardMaterial>;
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = -0.012;
    baseMesh.receiveShadow = true;
    s.add(baseMesh);
    layerKeys.forEach((key, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        transparent: key !== "ortho",
        depthWrite: key === "ortho",
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = i * 0.012;
      mesh.receiveShadow = key === "ortho";
      mapMats[key] = mat;
      mapMeshes[key] = mesh;
      s.add(mesh);
    });
    let center = { ...START },
      size = 250,
      active: THREE.Object3D = demo(s);
    const setMap = (l: Loc, ms: number) => {
      center = l;
      size = ms;
      const half = ms / 2,
        bbox = `${(l.n - half).toFixed(2)},${(l.e - half).toFixed(2)},${(l.n + half).toFixed(2)},${(l.e + half).toFixed(2)}`;
      baseMesh.geometry.dispose();
      baseMesh.geometry = new THREE.PlaneGeometry(ms, ms);
      layerKeys.forEach((key) => {
        const mesh = mapMeshes[key],
          mat = mapMats[key];
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(ms, ms);
        new THREE.TextureLoader().load(
          `/api/map?type=${key}&bbox=${bbox}&v=${Date.now()}`,
          (t) => {
            mat.map?.dispose();
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = r.capabilities.getMaxAnisotropy();
            mat.map = t;
            mat.needsUpdate = true;
          },
        );
      });
    };
    setMap(center, size);
    let yaw = 0,
      pitch = -Math.PI / 2,
      locked = false;
    const keys = new Set<string>(),
      ray = new THREE.Raycaster(),
      mouse = new THREE.Vector2();
    const kd = (e: KeyboardEvent) => keys.add(e.code),
      ku = (e: KeyboardEvent) => keys.delete(e.code),
      mm = (e: MouseEvent) => {
        if (!locked) return;
        yaw -= e.movementX * 0.0022;
        pitch = Math.max(-1.53, Math.min(1.53, pitch - e.movementY * 0.0022));
      };
    const click = (e: MouseEvent) => {
      if (pickRef.current) {
        const rect = r.domElement.getBoundingClientRect();
        mouse.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(mouse, cam);
        const hit = ray.intersectObject(mapMeshes.ortho)[0];
        if (hit) {
          const easting = center.e + hit.point.x,
            northing = center.n - hit.point.z,
            [lon, lat] = proj4(EPSG2180, "EPSG:4326", [easting, northing]);
          applyLoc({
            e: easting,
            n: northing,
            lat,
            lon,
            address: `Punkt z mapy: ${northing.toFixed(2)}, ${easting.toFixed(2)}`,
          });
        }
        return;
      }
      r.domElement.requestPointerLock();
    };
    r.domElement.addEventListener("click", click);
    const pl = () => (locked = document.pointerLockElement === r.domElement);
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm);
    document.addEventListener("pointerlockchange", pl);
    const clock = new THREE.Clock(),
      v = new THREE.Vector3(),
      side = new THREE.Vector3();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05),
        speed = keys.has("ShiftLeft") ? 18 : 6;
      cam.rotation.set(pitch, yaw, 0, "YXZ");
      cam.getWorldDirection(v);
      side.crossVectors(v, cam.up).normalize();
      if (keys.has("KeyW")) cam.position.addScaledVector(v, speed * dt);
      if (keys.has("KeyS")) cam.position.addScaledVector(v, -speed * dt);
      if (keys.has("KeyA")) cam.position.addScaledVector(side, -speed * dt);
      if (keys.has("KeyD")) cam.position.addScaledVector(side, speed * dt);
      if (keys.has("Space")) cam.position.y += speed * dt;
      if (keys.has("ControlLeft")) cam.position.y -= speed * dt;
      r.render(s, cam);
    };
    loop();
    const studyGroup = new THREE.Group(),
      studyMaterials: THREE.ShaderMaterial[] = [],
      flatModelMaterial = new THREE.MeshBasicMaterial({ color: 0xd8dbde }),
      originalMaterials = new Map<
        THREE.Mesh,
        THREE.Material | THREE.Material[]
      >();
    studyGroup.renderOrder = 5;
    s.add(studyGroup);
    const clearStudy = () => {
      studyGroup.clear();
      studyMaterials.splice(0).forEach((material) => material.dispose());
    };
    const restoreModel = () => {
      originalMaterials.forEach((material, mesh) => {
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      originalMaterials.clear();
    };
    const setStudy = (d: string, l: Loc, enabled: boolean) => {
      restoreModel();
      clearStudy();
      if (!enabled) return;
      active.updateMatrixWorld(true);
      for (let hour = 7; hour <= 17; hour++) {
        const q = sunPosition(
          polishDate(d, `${String(hour).padStart(2, "0")}:00`),
          l.lat,
          l.lon,
        );
        if (q.alt <= 0) continue;
        const a = q.az + Math.PI,
          sunDir = new THREE.Vector3(
            Math.sin(a) * Math.cos(q.alt),
            Math.sin(q.alt),
            Math.cos(a) * Math.cos(q.alt),
          ).normalize(),
          color = new THREE.Color().setHSL(
            THREE.MathUtils.lerp(0.58, 0.02, (hour - 7) / 10),
            0.52,
            0.3,
          ),
          material = new THREE.ShaderMaterial({
            uniforms: { sunDir: { value: sunDir }, color: { value: color } },
            vertexShader: `uniform vec3 sunDir; varying float height; void main(){vec4 world=modelMatrix*vec4(position,1.0);height=world.y;float t=(world.y-0.006)/max(sunDir.y,0.015);world.xyz-=sunDir*t;world.y=0.006;gl_Position=projectionMatrix*viewMatrix*world;}`,
            fragmentShader: `uniform vec3 color; varying float height; void main(){if(height<0.005) discard;gl_FragColor=vec4(color,0.105);}`,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
          });
        studyMaterials.push(material);
        active.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const footprint = new THREE.Mesh(object.geometry, material);
          footprint.matrix.copy(object.matrixWorld);
          footprint.matrixAutoUpdate = false;
          footprint.frustumCulled = false;
          footprint.renderOrder = 5;
          studyGroup.add(footprint);
        });
      }
      active.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        originalMaterials.set(object, object.material);
        object.material = flatModelMaterial;
        object.castShadow = false;
        object.receiveShadow = false;
      });
    };
    api.current = {
      map: setMap,
      layers: (visible: Record<LayerKey, boolean>, opacity: number) =>
        layerKeys.forEach((key) => {
          mapMeshes[key].visible = visible[key];
          mapMats[key].opacity = key === "ortho" ? 1 : opacity;
        }),
      light: (d: string, t: string, l: Loc) => {
        const q = sunPosition(polishDate(d, t), l.lat, l.lon),
          a = q.az + Math.PI,
          dist = 120;
        sun.position.set(
          Math.sin(a) * Math.cos(q.alt) * dist,
          Math.sin(q.alt) * dist,
          Math.cos(a) * Math.cos(q.alt) * dist,
        );
        sun.visible = q.alt > 0;
        sun.intensity = q.alt > 0 ? 1.2 + Math.sin(q.alt) * 2.2 : 0;
        hemi.intensity = q.alt > 0 ? 0.45 + Math.sin(q.alt) * 0.4 : 0.08;
        setSolar(q);
      },
      load: (file: File) => {
        restoreModel();
        clearStudy();
        setShadowStudy(false);
        const u = URL.createObjectURL(file);
        new GLTFLoader().load(u, (g) => {
          s.remove(active);
          active = g.scene;
          active.traverse((o) => {
            if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
          });
          s.add(active);
          const b = new THREE.Box3().setFromObject(active),
            c = b.getCenter(new THREE.Vector3()),
            sz = b.getSize(new THREE.Vector3());
          if (Math.max(Math.abs(c.x), Math.abs(c.z)) > 10000) {
            active.position.x -= c.x;
            active.position.z -= c.z;
          }
          active.position.y -= b.min.y;
          cam.position.set(
            0,
            Math.max(65, size * 0.72, Math.max(sz.x, sz.z) * 1.1),
            0.01,
          );
          yaw = 0;
          pitch = -Math.PI / 2;
          URL.revokeObjectURL(u);
        });
      },
      reset: () => {
        cam.position.set(0, Math.max(65, size * 0.72), 0.01);
        yaw = 0;
        pitch = -Math.PI / 2;
      },
      top: () => {
        cam.position.set(0, Math.max(65, size * 0.72), 0.01);
        yaw = 0;
        pitch = -Math.PI / 2;
      },
      study: setStudy,
      capture: (d: string) => {
        r.render(s, cam);
        const link = document.createElement("a");
        link.download = `analiza-cieni-${d}.png`;
        link.href = r.domElement.toDataURL("image/png");
        link.click();
      },
    };
    api.current.light(date, time, START);
    api.current.layers(
      { ortho: true, egib: true, gesut: false, bdot: false },
      0.82,
    );
    const resize = () => {
      cam.aspect = h.clientWidth / h.clientHeight;
      cam.updateProjectionMatrix();
      r.setSize(h.clientWidth, h.clientHeight);
    };
    addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      r.domElement.removeEventListener("click", click);
      removeEventListener("resize", resize);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("pointerlockchange", pl);
      restoreModel();
      clearStudy();
      flatModelMaterial.dispose();
      r.dispose();
    };
  }, []);
  useEffect(() => api.current?.light(date, time, loc), [date, time, loc]);
  useEffect(() => api.current?.map(loc, mapSize), [loc, mapSize]);
  useEffect(
    () => api.current?.layers(layers, layerOpacity),
    [layers, layerOpacity],
  );
  useEffect(
    () => api.current?.study(date, loc, shadowStudy),
    [date, loc, shadowStudy],
  );
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) return;
    const timer = setTimeout(() => setDate(dateDraft), 1500);
    return () => clearTimeout(timer);
  }, [dateDraft]);
  useEffect(() => {
    if (!play) return;
    const id = setInterval(
      () =>
        setTime((v) => {
          const [a, b] = v.split(":").map(Number),
            m = (a * 60 + b + 10) % 1440;
          return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        }),
      130,
    );
    return () => clearInterval(id);
  }, [play]);
  const mins = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const geocode = async () => {
    setStatus("Szukam adresu…");
    try {
      const r = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j.error);
      applyLoc({ ...j, address });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Nie znaleziono adresu");
    }
  };
  const fromXY = () => {
    const n = Number(x.replace(",", ".")),
      e = Number(y.replace(",", "."));
    if (!Number.isFinite(n) || !Number.isFinite(e)) {
      setStatus("Sprawdź współrzędne X/Y");
      return;
    }
    const [lon, lat] = proj4(EPSG2180, "EPSG:4326", [e, n]);
    applyLoc({
      n,
      e,
      lat,
      lon,
      address: `Współrzędne X/Y: ${n.toFixed(2)}, ${e.toFixed(2)}`,
    });
  };
  const fromGPS = () => {
    const parts = gps
      .trim()
      .replace(/;/g, ",")
      .split(/[,\s]+/)
      .filter(Boolean);
    if (parts.length < 2) {
      setStatus("Wklej szerokość i długość geograficzną");
      return;
    }
    const lat = Number(parts[0]),
      lon = Number(parts[1]);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < 49 ||
      lat > 55 ||
      lon < 14 ||
      lon > 25
    ) {
      setStatus("Sprawdź współrzędne GPS — najpierw szerokość, potem długość");
      return;
    }
    const [e, n] = proj4("EPSG:4326", EPSG2180, [lon, lat]);
    applyLoc({
      lat,
      lon,
      e,
      n,
      address: `GPS: ${lat.toFixed(7)}, ${lon.toFixed(7)}`,
    });
  };
  return (
    <main>
      <div ref={host} className={`view ${pick ? "picking" : ""}`} />
      <header>
        <div>
          <small>GEO · STUDIO ŚWIATŁA</small>
          <h1>Symulator nasłonecznienia 3D</h1>
        </div>
        <span className="chip">● {model}</span>
      </header>
      <div className="cross">＋</div>
      {panel && (
        <aside>
          <div className="tabs">
            <button
              className={mode === "address" ? "active" : ""}
              onClick={() => setMode("address")}
            >
              Adres
            </button>
            <button
              className={mode === "xy" ? "active" : ""}
              onClick={() => setMode("xy")}
            >
              X / Y
            </button>
            <button
              className={mode === "gps" ? "active" : ""}
              onClick={() => setMode("gps")}
            >
              GPS
            </button>
          </div>
          {mode === "address" && (
            <div className="location-form">
              <label>Adres w Polsce</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && geocode()}
              />
              <button className="primary" onClick={geocode}>
                Znajdź i wczytaj mapę
              </button>
            </div>
          )}
          {mode === "xy" && (
            <div className="location-form xy">
              <label>X — północ</label>
              <input value={x} onChange={(e) => setX(e.target.value)} />
              <label>Y — wschód</label>
              <input value={y} onChange={(e) => setY(e.target.value)} />
              <button className="primary" onClick={fromXY}>
                Wczytaj mapę
              </button>
            </div>
          )}
          {mode === "gps" && (
            <div className="location-form">
              <label>Współrzędne z Google Maps</label>
              <input
                value={gps}
                onChange={(e) => setGps(e.target.value)}
                placeholder="50.16545019801309, 18.9081535705677"
                onKeyDown={(e) => e.key === "Enter" && fromGPS()}
              />
              <button className="primary" onClick={fromGPS}>
                Wczytaj mapę
              </button>
            </div>
          )}
          <div className="map-meta">
            <div>
              <b>{loc.address}</b>
              <span>EPSG:2180 · Z = 0</span>
            </div>
            <code>
              X {loc.n.toFixed(2)}
              <br />Y {loc.e.toFixed(2)}
            </code>
          </div>
          {status && <div className="status">{status}</div>}
          <label className="size">
            Rozmiar mapy
            <select
              value={mapSize}
              onChange={(e) => setMapSize(+e.target.value)}
            >
              <option value="100">100 × 100 m</option>
              <option value="250">250 × 250 m</option>
              <option value="500">500 × 500 m</option>
              <option value="1000">1000 × 1000 m</option>
            </select>
          </label>
          <section className="layers">
            <div className="layers-title">
              <b>Warstwy Geoportalu</b>
              <span>EPSG:2180</span>
            </div>
            {(
              [
                ["ortho", "Ortofotomapa"],
                ["egib", "Granice i budynki"],
                ["gesut", "Sieci uzbrojenia"],
                ["bdot", "Mapa zasadnicza"],
              ] as [LayerKey, string][]
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() =>
                    setLayers((value) => ({ ...value, [key]: !value[key] }))
                  }
                />
                <i className={`layer-dot ${key}`} />
                <span>{label}</span>
              </label>
            ))}
            <div className="opacity">
              <span>Widoczność nakładek</span>
              <input
                type="range"
                min="15"
                max="100"
                value={Math.round(layerOpacity * 100)}
                onChange={(e) => setLayerOpacity(+e.target.value / 100)}
              />
              <b>{Math.round(layerOpacity * 100)}%</b>
            </div>
          </section>
          <div className="row">
            <input
              type="date"
              defaultValue={date}
              onChange={(e) => setDateDraft(e.target.value)}
              onBlur={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                  setDate(e.target.value);
              }}
            />
            <output>{time}</output>
          </div>
          <input
            className="range"
            type="range"
            min="0"
            max="1439"
            step="5"
            value={mins}
            onChange={(e) => {
              const m = +e.target.value;
              setTime(
                `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
              );
            }}
          />
          <button className="primary" onClick={() => setPlay(!play)}>
            {play ? "❚❚ Zatrzymaj" : "▶ Odtwórz dzień"}
          </button>
          <div className="sun">
            <span>
              Wysokość <b>{(solar.alt / rad).toFixed(1)}°</b>
            </span>
            <span>
              Azymut <b>{((solar.az / rad + 180 + 360) % 360).toFixed(1)}°</b>
            </span>
          </div>
          <section className="shadow-tools">
            <div className="shadow-title">
              <b>Analiza cieni 7:00–17:00</b>
              <span>{date}</span>
            </div>
            <button
              className={shadowStudy ? "primary" : ""}
              onClick={() => setShadowStudy((value) => !value)}
            >
              {shadowStudy ? "✓ Cienie godzinowe włączone" : "Pokaż wszystkie cienie"}
            </button>
            {shadowStudy && (
              <div className="shadow-legend">
                <span>7:00</span>
                <i />
                <span>12:00</span>
                <i />
                <span>17:00</span>
              </div>
            )}
            <div className="view-actions">
              <button onClick={() => api.current?.top()}>▣ Widok z góry</button>
              <button onClick={() => api.current?.capture(date)}>
                ↓ Zapisz PNG
              </button>
            </div>
          </section>
          <label className="upload">
            <input
              type="file"
              accept=".glb,.gltf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setModel(f.name);
                  api.current?.load(f);
                }
              }}
            />
            ↑ Wczytaj model GLB
          </label>
          <button onClick={() => api.current?.reset()}>
            ↺ Widok początkowy
          </button>
        </aside>
      )}
      <button className="toggle" onClick={() => setPanel(!panel)}>
        {panel ? "×" : "☰"}
      </button>
      <footer>
        <kbd>WASD</kbd> ruch　<kbd>MYSZ</kbd> widok　<kbd>SPACJA/CTRL</kbd>{" "}
        góra/dół　<kbd>SHIFT</kbd> szybciej
      </footer>
      {pick && (
        <div className="pick-hint">
          Kliknij wybrane miejsce na ortofotomapie
        </div>
      )}
    </main>
  );
}