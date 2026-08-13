import {NextRequest} from "next/server";
import proj4 from "proj4";


const EPSG2180="+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs";
const esc=(v:string)=>v.replace(/[<>&'\"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]!));


export async function POST(req:NextRequest){
  const {address}=await req.json() as {address?:string};
  if(!address?.trim())return Response.json({error:"Wpisz adres"},{status:400});
  const xml=`<xls:XLS version="1.2" xmlns:xls="http://www.opengis.net/xls" xmlns:gugik_ols="http://www.geoportal.gov.pl/schema/ols"><xls:RequestHeader/><xls:Request methodName="GeocodeRequest" version="1.0.0" requestID="1"><gugik_ols:GeocodeRequest><gugik_ols:AddressPoint countryCode="PL"><gugik_ols:freeFormAddress>${esc(address)}</gugik_ols:freeFormAddress></gugik_ols:AddressPoint></gugik_ols:GeocodeRequest></xls:Request></xls:XLS>`;
  const response=await fetch("https://mapy.geoportal.gov.pl/openLSgp/geocode",{method:"POST",headers:{"Content-Type":"application/xml"},body:xml,cache:"no-store"});
  const text=await response.text();
  const match=text.match(/<(?:\w+:)?pos[^>]*>\s*([\d.-]+)\s+([\d.-]+)\s*<\//i);
  if(!match)return Response.json({error:"Geoportal nie znalazł tego adresu"},{status:404});
  let a=Number(match[1]),b=Number(match[2]);
  const lat=a>40&&a<56?a:b,lon=a>40&&a<56?b:a;
  const [e,n]=proj4("EPSG:4326",EPSG2180,[lon,lat]);
  return Response.json({lat,lon,e,n,address});
}
