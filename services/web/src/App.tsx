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
      {/* Both forms resolve: the seller's text links to /store, judges may paste a slug. */}
      <Route path="/store" element={<BuyerStorefront />} />
      <Route path="/store/:slug" element={<BuyerStorefront />} />
    </Routes>
  );
}
