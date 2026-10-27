import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Romeo Haro · Recuerdos compartidos",
  description: "Un espacio para crear eventos y reunir las fotografías de todos tus invitados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
