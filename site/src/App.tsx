import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { Nav } from "./components/Nav";
import { parseLocale } from "./lib/locale";
import { DocsPage } from "./pages/DocsPage";
import { Home } from "./pages/Home";

export function App() {
  const [params] = useSearchParams();
  const locale = parseLocale(params.get("lang"));

  return (
    <>
      <Nav locale={locale} />
      <Routes>
        <Route path="/" element={<Home locale={locale} />} />
        <Route path="/docs" element={<Navigate to="/docs/start" replace />} />
        <Route path="/docs/:slug" element={<DocsPage locale={locale} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
