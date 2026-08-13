import type { Metadata } from "next";
import "./globals.css";
import "./controls.css";
export const metadata: Metadata={title:"Symulator nasłonecznienia 3D",description:"Nasłonecznienie budynku na podkładzie Geoportalu"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pl"><body>{children}</body></html>}
