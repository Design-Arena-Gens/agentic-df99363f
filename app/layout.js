import "./globals.css";

export const metadata = {
  title: "Happy Wheels Clone - Pogo Stickman",
  description: "A mini Happy Wheels style level with Pogo Stickman."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
