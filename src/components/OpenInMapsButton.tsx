import { useMemo } from "react";
import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildAppleMapsUrl,
  buildGoogleMapsUrl,
  buildMapsUrl,
  detectMapsPlatform,
  hasDestination,
  type MapsDestination,
} from "@/lib/openInMaps";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ButtonSize = "default" | "sm" | "lg" | "icon";
type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "link";

interface Props extends MapsDestination {
  size?: ButtonSize;
  variant?: ButtonVariant;
  label?: string;
  iconOnly?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Small "Directions" / "Open in Maps" button that deep-links into
 * Apple Maps (iOS/macOS) or Google Maps (everything else).
 * If platform detection is uncertain, exposes both options via dropdown.
 */
export function OpenInMapsButton({
  address,
  postcode,
  lat,
  lng,
  size = "sm",
  variant = "outline",
  label,
  iconOnly = false,
  className,
  onClick,
}: Props) {
  const dest: MapsDestination = { address, postcode, lat, lng };
  const platform = useMemo(() => detectMapsPlatform(), []);

  if (!hasDestination(dest)) return null;

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };

  if (platform === "unknown") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            variant={variant}
            className={className}
            onClick={stop}
            title="Open in Maps"
            aria-label="Open in Maps"
          >
            <Navigation className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5 mr-1.5"} />
            {!iconOnly && (label ?? "Directions")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem asChild>
            <a href={buildAppleMapsUrl(dest)} target="_blank" rel="noopener noreferrer">
              Apple Maps
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={buildGoogleMapsUrl(dest)} target="_blank" rel="noopener noreferrer">
              Google Maps
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const href = buildMapsUrl(dest, platform);
  const defaultLabel = label ?? (platform === "apple" ? "Directions" : "Directions");

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        title={platform === "apple" ? "Open in Apple Maps" : "Open in Google Maps"}
        aria-label={platform === "apple" ? "Open in Apple Maps" : "Open in Google Maps"}
      >
        <Navigation className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5 mr-1.5"} />
        {!iconOnly && defaultLabel}
      </a>
    </Button>
  );
}

export default OpenInMapsButton;
