import { useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    }
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">That page does not exist</h1>
        <p className="text-muted-foreground">The link may be old or mistyped.</p>
        <Button asChild><Link to="/jobs">Back to Jobs</Link></Button>
      </div>
    </div>
  );
};

export default NotFound;
