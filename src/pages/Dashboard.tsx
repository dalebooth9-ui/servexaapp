import { useAuth } from "@/hooks/useAuth";
import EngineerTodayHome from "@/components/engineer/EngineerTodayHome";
import DirectorDashboard from "@/components/DirectorDashboard";

export default function Dashboard() {
  const { userRole } = useAuth();

  if (userRole === "engineer") {
    return <EngineerTodayHome />;
  }

  if (userRole !== "admin") {
    return null;
  }

  return <DirectorDashboard />;
}
