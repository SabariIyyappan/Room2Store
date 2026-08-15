import { Routes, Route } from "react-router-dom";
import SellerUpload from "./pages/SellerUpload";
import SetupFlow from "./pages/SetupFlow";
import Dashboard from "./pages/Dashboard";
import BuyerStorefront from "./pages/BuyerStorefront";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SellerUpload />} />
      <Route path="/dashboard/:campaignId/setup" element={<SetupFlow />} />
      <Route path="/dashboard/:campaignId" element={<Dashboard />} />
      <Route path="/store/:slug" element={<BuyerStorefront />} />
    </Routes>
  );
}
