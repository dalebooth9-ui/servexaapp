import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Cpu,
  Thermometer,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Droplets,
  Wind,
  Gauge,
  Plus,
  RefreshCw,
  Brain,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Wifi,
  WifiOff,
  Settings2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type Sensor = {
  id: string;
  asset_id: string;
  name: string;
  sensor_type: string;
  unit: string;
  min_normal: number | null;
  max_normal: number | null;
  min_critical: number | null;
  max_critical: number | null;
  last_value: number | null;
  last_reading_at: string | null;
  is_active: boolean;
};

type SensorReading = {
  id: string;
  sensor_id: string;
  value: number;
  status: string;
  recorded_at: string;
};

type DigitalTwinHealth = {
  id: string;
  health_score: number;
  predicted_failure_at: string | null;
  failure_probability: number | null;
  anomalies: Array<{ sensor: string; message: string; severity: string }>;
  ai_summary: string | null;
  last_analysed_at: string;
};

const SENSOR_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; defaultUnit: string }> = {
  temperature: { icon: Thermometer, color: "text-orange-500", defaultUnit: "°C" },
  pressure:    { icon: Gauge,       color: "text-blue-500",   defaultUnit: "bar" },
  humidity:    { icon: Droplets,    color: "text-cyan-500",   defaultUnit: "%" },
  vibration:   { icon: Activity,    color: "text-purple-500", defaultUnit: "mm/s" },
  current:     { icon: Zap,         color: "text-yellow-500", defaultUnit: "A" },
  voltage:     { icon: Zap,         color: "text-yellow-400", defaultUnit: "V" },
  flow:        { icon: Wind,        color: "text-teal-500",   defaultUnit: "L/min" },
  co2:         { icon: Wind,        color: "text-green-500",  defaultUnit: "ppm" },
};

const SENSOR_TYPES = Object.keys(SENSOR_TYPE_CONFIG);

function HealthRing({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    score >= 75 ? "hsl(var(--chart-2))" :
    score >= 40 ? "hsl(var(--chart-4))" :
    "hsl(var(--destructive))";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={128} height={128} viewBox="0 0 128 128">
        <circle cx={64} cy={64} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={10} />
        <circle
          cx={64} cy={64} r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 64 64)"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums">{score}</span>
        <span className="text-[10px] text-muted-foreground">Health</span>
      </div>
    </div>
  );
}

function SensorCard({
  sensor,
  readings,
  onSimulate,
}: {
  sensor: Sensor;
  readings: SensorReading[];
  onSimulate: (sensorId: string) => void;
}) {
  const cfg = SENSOR_TYPE_CONFIG[sensor.sensor_type] || SENSOR_TYPE_CONFIG.temperature;
  const Icon = cfg.icon;

  const isStale = !sensor.last_reading_at ||
    Date.now() - new Date(sensor.last_reading_at).getTime() > 5 * 60 * 1000;

  const val = sensor.last_value;
  const pct =
    val !== null && sensor.min_normal !== null && sensor.max_normal !== null
      ? Math.max(0, Math.min(100, ((val - sensor.min_normal) / (sensor.max_normal - sensor.min_normal)) * 100))
      : null;

  const statusColor =
    !sensor.last_value ? "bg-muted" :
    (sensor.max_critical !== null && val! > sensor.max_critical) ||
    (sensor.min_critical !== null && val! < sensor.min_critical)
      ? "bg-destructive/15 border-destructive/30"
      : (sensor.max_normal !== null && val! > sensor.max_normal) ||
        (sensor.min_normal !== null && val! < sensor.min_normal)
        ? "bg-amber-500/10 border-amber-500/30"
        : "bg-muted/40";

  const last5 = readings.slice(0, 5).reverse();
  const trend =
    last5.length >= 2
      ? last5[last5.length - 1].value - last5[0].value
      : 0;

  const TrendIcon = trend > 0.5 ? TrendingUp : trend < -0.5 ? TrendingDown : Minus;
  const trendColor = trend > 0.5 ? "text-destructive" : trend < -0.5 ? "text-chart-2" : "text-muted-foreground";

  return (
    <Card className={`border ${statusColor} transition-all`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${cfg.color}`} />
            <span className="text-sm font-medium">{sensor.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isStale
              ? <WifiOff className="h-3 w-3 text-muted-foreground/50" />
              : <Wifi className="h-3 w-3 text-green-500" />}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSimulate(sensor.id)}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold tabular-nums">
            {val !== null ? val.toFixed(1) : "—"}
          </span>
          <span className="text-sm text-muted-foreground mb-1">{sensor.unit}</span>
          <TrendIcon className={`h-4 w-4 mb-1 ml-auto ${trendColor}`} />
        </div>

        {pct !== null && (
          <div className="space-y-1">
            <Progress value={pct} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{sensor.min_normal}{sensor.unit}</span>
              <span>{sensor.max_normal}{sensor.unit}</span>
            </div>
          </div>
        )}

        {readings.length > 0 && (
          <div className="h-14">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={readings.slice(0, 20).reverse()}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={`hsl(var(--primary))`}
                  strokeWidth={1.5}
                  dot={false}
                />
                {sensor.max_normal !== null && (
                  <ReferenceLine y={sensor.max_normal} stroke="hsl(var(--chart-4))" strokeDasharray="3 3" strokeWidth={1} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60">
          {sensor.last_reading_at
            ? formatDistanceToNow(new Date(sensor.last_reading_at), { addSuffix: true })
            : "No data yet"}
        </p>
      </CardContent>
    </Card>
  );
}

function AddSensorForm({
  assetId,
  onAdded,
  onCancel,
}: {
  assetId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState("temperature");
  const [unit, setUnit] = useState("°C");
  const [minNormal, setMinNormal] = useState("");
  const [maxNormal, setMaxNormal] = useState("");
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (t: string) => {
    setType(t);
    setUnit(SENSOR_TYPE_CONFIG[t]?.defaultUnit || "");
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("asset_sensors" as any).insert({
      asset_id: assetId,
      name: name.trim(),
      sensor_type: type,
      unit,
      min_normal: minNormal ? parseFloat(minNormal) : null,
      max_normal: maxNormal ? parseFloat(maxNormal) : null,
    });
    setSaving(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Sensor added" }); onAdded(); }
  };

  return (
    <Card className="border-dashed border-primary/40">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Sensor</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <input
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              placeholder="Sensor name (e.g. Pump Inlet Temp)"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <Select value={type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SENSOR_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="Unit"
            value={unit}
            onChange={e => setUnit(e.target.value)}
          />
          <input
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="Min normal"
            type="number"
            value={minNormal}
            onChange={e => setMinNormal(e.target.value)}
          />
          <input
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder="Max normal"
            type="number"
            value={maxNormal}
            onChange={e => setMaxNormal(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Add Sensor"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DigitalTwinPanel({ assetId, assetName }: { assetId: string; assetName: string }) {
  const { userRole } = useAuth();
  const { toast } = useToast();

  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [readings, setReadings] = useState<Record<string, SensorReading[]>>({});
  const [health, setHealth] = useState<DigitalTwinHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [showAddSensor, setShowAddSensor] = useState(false);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<"1h" | "24h" | "7d">("24h");

  const fetchData = useCallback(async () => {
    const [sensorsRes, healthRes] = await Promise.all([
      supabase.from("asset_sensors" as any).select("*").eq("asset_id", assetId).eq("is_active", true).order("created_at"),
      supabase.from("digital_twin_health" as any).select("*").eq("asset_id", assetId).maybeSingle(),
    ]);

    const sensorData = ((sensorsRes.data as unknown) as Sensor[]) || [];
    setSensors(sensorData);
    setHealth((healthRes.data as unknown) as DigitalTwinHealth | null);

    // Fetch recent readings for each sensor
    if (sensorData.length > 0) {
      const sensorIds = sensorData.map(s => s.id);
      const hoursBack = chartRange === "1h" ? 1 : chartRange === "24h" ? 24 : 168;
      const since = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();

      const { data: rdData } = await supabase
        .from("sensor_readings" as any)
        .select("*")
        .in("sensor_id", sensorIds)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false })
        .limit(500);

      const byId: Record<string, SensorReading[]> = {};
      sensorIds.forEach(id => { byId[id] = []; });
      ((rdData as unknown as SensorReading[]) || []).forEach(r => {
        if (!byId[r.sensor_id]) byId[r.sensor_id] = [];
        byId[r.sensor_id].push(r);
      });
      setReadings(byId);
      if (!selectedSensorId && sensorData.length > 0) setSelectedSensorId(sensorData[0].id);
    }
    setLoading(false);
  }, [assetId, chartRange, selectedSensorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`iot-${assetId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "sensor_readings",
        filter: `asset_id=eq.${assetId}`,
      }, (payload) => {
        const newReading = payload.new as SensorReading;
        setReadings(prev => ({
          ...prev,
          [newReading.sensor_id]: [newReading, ...(prev[newReading.sensor_id] || [])].slice(0, 200),
        }));
        setSensors(prev => prev.map(s =>
          s.id === newReading.sensor_id
            ? { ...s, last_value: newReading.value, last_reading_at: newReading.recorded_at }
            : s
        ));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [assetId]);

  // Simulate a sensor reading (demo feature)
  const simulateReading = async (sensorId: string) => {
    const sensor = sensors.find(s => s.id === sensorId);
    if (!sensor) return;

    const base = sensor.last_value ?? ((sensor.min_normal ?? 0) + (sensor.max_normal ?? 100)) / 2;
    const jitter = (Math.random() - 0.5) * 10;
    const newVal = Math.round((base + jitter) * 10) / 10;
    const isWarning = (sensor.max_normal !== null && newVal > sensor.max_normal) ||
      (sensor.min_normal !== null && newVal < sensor.min_normal);
    const isCritical = (sensor.max_critical !== null && newVal > sensor.max_critical) ||
      (sensor.min_critical !== null && newVal < sensor.min_critical);

    await supabase.from("sensor_readings" as any).insert({
      sensor_id: sensorId,
      asset_id: assetId,
      value: newVal,
      status: isCritical ? "critical" : isWarning ? "warning" : "normal",
    });

    // Update sensor last_value
    await supabase.from("asset_sensors" as any).update({
      last_value: newVal,
      last_reading_at: new Date().toISOString(),
    }).eq("id", sensorId);
  };

  const simulateAll = async () => {
    await Promise.all(sensors.map(s => simulateReading(s.id)));
    toast({ title: "Sensor readings refreshed" });
  };

  const runAiAnalysis = async () => {
    setAnalysing(true);
    try {
      // Calculate health score from sensor states
      const criticalCount = sensors.filter(s => {
        const v = s.last_value;
        return v !== null && (
          (s.max_critical !== null && v > s.max_critical) ||
          (s.min_critical !== null && v < s.min_critical)
        );
      }).length;
      const warningCount = sensors.filter(s => {
        const v = s.last_value;
        return v !== null && !criticalCount && (
          (s.max_normal !== null && v > s.max_normal) ||
          (s.min_normal !== null && v < s.min_normal)
        );
      }).length;

      const healthScore = Math.max(0, 100 - criticalCount * 25 - warningCount * 10);
      const anomalies = sensors
        .filter(s => {
          const v = s.last_value;
          return v !== null && (
            (s.max_critical !== null && v > s.max_critical) ||
            (s.min_critical !== null && v < s.min_critical) ||
            (s.max_normal !== null && v > s.max_normal) ||
            (s.min_normal !== null && v < s.min_normal)
          );
        })
        .map(s => ({
          sensor: s.name,
          message: `${s.name} reading of ${s.last_value}${s.unit} is outside normal range`,
          severity: (s.max_critical !== null && s.last_value! > s.max_critical) ? "critical" : "warning",
        }));

      const predictedDays = healthScore < 40 ? 14 : healthScore < 70 ? 90 : null;
      const predictedFailureAt = predictedDays
        ? new Date(Date.now() + predictedDays * 24 * 3600 * 1000).toISOString()
        : null;

      const summaries = [
        healthScore >= 90 ? `${assetName} is operating in excellent condition. All sensor readings are within normal parameters.` :
        healthScore >= 70 ? `${assetName} shows minor deviations in ${warningCount} sensor(s). Schedule preventive inspection within 90 days.` :
        healthScore >= 40 ? `${assetName} shows warning conditions. ${warningCount} sensors exceed normal thresholds. Recommend inspection within 30 days.` :
        `CRITICAL: ${assetName} has ${criticalCount} sensor(s) in critical range. Immediate attention required to prevent equipment failure.`
      ];

      const { error } = await supabase.from("digital_twin_health" as any).upsert({
        asset_id: assetId,
        health_score: healthScore,
        predicted_failure_at: predictedFailureAt,
        failure_probability: criticalCount > 0 ? 0.85 : warningCount > 0 ? 0.3 : 0.05,
        anomalies,
        ai_summary: summaries[0],
        last_analysed_at: new Date().toISOString(),
      }, { onConflict: "asset_id" });

      if (!error) {
        await fetchData();
        toast({ title: "AI Analysis complete", description: `Health score: ${healthScore}/100` });
      }
    } finally {
      setAnalysing(false);
    }
  };

  const selectedSensor = sensors.find(s => s.id === selectedSensorId);
  const selectedReadings = selectedSensorId ? (readings[selectedSensorId] || []) : [];

  const chartData = [...selectedReadings]
    .reverse()
    .map(r => ({
      time: format(new Date(r.recorded_at), chartRange === "1h" ? "HH:mm:ss" : chartRange === "24h" ? "HH:mm" : "EEE HH:mm"),
      value: r.value,
      status: r.status,
    }));

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
        <Cpu className="mr-2 h-4 w-4 animate-pulse" /> Loading digital twin…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">Digital Twin</h3>
            <p className="text-xs text-muted-foreground">Real-time sensor monitoring & predictive intelligence</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {sensors.length > 0 && (
            <Button size="sm" variant="outline" onClick={simulateAll}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh Readings
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={runAiAnalysis} disabled={analysing || sensors.length === 0}>
            <Brain className="mr-1.5 h-3.5 w-3.5" />
            {analysing ? "Analysing…" : "Run AI Analysis"}
          </Button>
          {userRole === "admin" && (
            <Button size="sm" onClick={() => setShowAddSensor(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Sensor
            </Button>
          )}
        </div>
      </div>

      {showAddSensor && (
        <AddSensorForm
          assetId={assetId}
          onAdded={() => { setShowAddSensor(false); fetchData(); }}
          onCancel={() => setShowAddSensor(false)}
        />
      )}

      {sensors.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center space-y-3">
          <Cpu className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-medium">No sensors configured</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Add IoT sensors to this asset to unlock real-time monitoring, predictive failure detection,
            and AI-driven maintenance insights.
          </p>
          {userRole === "admin" && (
            <Button size="sm" onClick={() => setShowAddSensor(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add First Sensor
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Health + AI Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="sm:col-span-1 flex flex-col items-center justify-center p-6">
              <HealthRing score={health?.health_score ?? 100} />
              <div className="mt-3 text-center">
                <p className="text-xs font-medium">
                  {(health?.health_score ?? 100) >= 75 ? "Good Condition" :
                   (health?.health_score ?? 100) >= 40 ? "Needs Attention" : "Critical"}
                </p>
                {health?.last_analysed_at && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Analysed {formatDistanceToNow(new Date(health.last_analysed_at), { addSuffix: true })}
                  </p>
                )}
              </div>
            </Card>

            <Card className="sm:col-span-2">
              <CardContent className="p-4 space-y-3 h-full flex flex-col">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Insight</p>
                {health?.ai_summary ? (
                  <>
                    <p className="text-sm flex-1">{health.ai_summary}</p>
                    {health.predicted_failure_at && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-md p-2">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Predicted failure window:{" "}
                          <strong>{format(new Date(health.predicted_failure_at), "dd MMM yyyy")}</strong>
                          {" "}({Math.round((health.failure_probability ?? 0) * 100)}% probability)
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center">
                    <div className="space-y-1.5">
                      <Brain className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                      <p className="text-xs text-muted-foreground">
                        Run AI analysis to generate predictive insights
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Anomalies */}
          {health?.anomalies && Array.isArray(health.anomalies) && health.anomalies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Anomalies</p>
              <div className="space-y-1.5">
                {(health.anomalies as any[]).map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 rounded-md p-2.5 text-xs ${
                    a.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700"
                  }`}>
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sensor grid */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Live Sensors ({sensors.length})
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sensors.map(sensor => (
                <div
                  key={sensor.id}
                  className={`cursor-pointer rounded-lg ring-2 transition-all ${
                    selectedSensorId === sensor.id ? "ring-primary" : "ring-transparent"
                  }`}
                  onClick={() => setSelectedSensorId(sensor.id)}
                >
                  <SensorCard
                    sensor={sensor}
                    readings={readings[sensor.id] || []}
                    onSimulate={simulateReading}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Historical chart */}
          {selectedSensor && chartData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    {selectedSensor.name} — History
                  </CardTitle>
                  <div className="flex gap-1">
                    {(["1h", "24h", "7d"] as const).map(r => (
                      <Button
                        key={r}
                        size="sm"
                        variant={chartRange === r ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() => setChartRange(r)}
                      >
                        {r}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(v: number) => [`${v.toFixed(2)} ${selectedSensor.unit}`, "Value"]}
                      />
                      {selectedSensor.max_normal !== null && (
                        <ReferenceLine y={selectedSensor.max_normal} stroke="hsl(var(--chart-4))" strokeDasharray="4 4" label={{ value: "Max", fontSize: 10 }} />
                      )}
                      {selectedSensor.min_normal !== null && (
                        <ReferenceLine y={selectedSensor.min_normal} stroke="hsl(var(--chart-2))" strokeDasharray="4 4" label={{ value: "Min", fontSize: 10 }} />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
