import { NextRequest } from "next/server";


export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get("bbox");
  const type = req.nextUrl.searchParams.get("type") || "ortho";
  if (
    !bbox ||
    !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(bbox)
  )
    return new Response("Nieprawidłowy bbox", { status: 400 });
  const configs = {
    ortho: {
      url: "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution",
      layers: "Raster",
      format: "image/jpeg",
      version: "1.3.0",
    },
    egib: {
      url: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow",
      layers: "dzialki,numery_dzialek,budynki",
      format: "image/png",
      version: "1.1.1",
    },
    gesut: {
      url: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
      layers:
        "przewod_wodociagowy,przewod_kanalizacyjny,przewod_gazowy,przewod_cieplowniczy,przewod_elektroenergetyczny,przewod_telekomunikacyjny,przewod_specjalny",
      format: "image/png",
      version: "1.1.1",
    },
    bdot: {
      url: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaBazDanychObiektowTopograficznych",
      layers: "bdot",
      format: "image/png",
      version: "1.1.1",
    },
  } as const;
  if (!(type in configs))
    return new Response("Nieprawidłowa warstwa", { status: 400 });
  const config = configs[type as keyof typeof configs],
    parts = bbox.split(",");
  const serviceBbox =
    config.version === "1.1.1"
      ? [parts[1], parts[0], parts[3], parts[2]].join(",")
      : bbox;
  const url = new URL(config.url);
  const params: Record<string, string> = {
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: config.version,
    LAYERS: config.layers,
    STYLES: "",
    BBOX: serviceBbox,
    WIDTH: "1600",
    HEIGHT: "1600",
    FORMAT: config.format,
  };
  if (config.version === "1.1.1") params.SRS = "EPSG:2180";
  else params.CRS = "EPSG:2180";
  if (type !== "ortho") params.TRANSPARENT = "TRUE";
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url, { next: { revalidate: 86400 } });
  if (!response.ok)
    return new Response("Geoportal nie odpowiedział", { status: 502 });
  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": response.headers.get("content-type") || config.format,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
