import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: "repuestomovil",
  description: "repuestomovil 维修开单管理系统"
};

export const viewport = {
  width: "device-width",
  initialScale: 1
};

const themeScript = `
(() => {
  try {
    const theme = localStorage.getItem("repairnote-theme") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script id="repairnote-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
