import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Index from "./pages/Index";
import About from "./pages/About";
import Docs from "./pages/Docs";
import UseCases from "./pages/UseCases";
import Downloads from "./pages/Downloads";
import Contact from "./pages/Contact";
import Roadmap from "./pages/Roadmap";
import Blog from "./pages/Blog";
import IntroducingFernlink from "./pages/blog/IntroducingFernlink";
import MultiTransport from "./pages/blog/MultiTransport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/about" element={<About />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/use-cases" element={<UseCases />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/introducing-fernlink" element={<IntroducingFernlink />} />
            <Route path="/blog/multi-transport" element={<MultiTransport />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
