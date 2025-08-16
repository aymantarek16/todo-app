/* eslint-disable react/react-in-jsx-scope */
import "./globals.css";

export const metadata = {
  title: "To Do List",
  description: "Organize your day like a boss",
  keywords: "todo, list, tasks, nextjs, app",
  creator: "Ayman Tarek",
};

// eslint-disable-next-line react/prop-types
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="overflow-x-hidden">{children}</body>
    </html>
  );
}
