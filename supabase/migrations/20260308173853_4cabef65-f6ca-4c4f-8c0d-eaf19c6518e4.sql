
-- IoT Sensors configuration table
CREATE TABLE public.asset_sensors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sensor_type TEXT NOT NULL DEFAULT 'temperature', -- temperature, pressure, humidity, vibration, current, flow, co2, voltage
  unit TEXT NOT NULL DEFAULT '°C',
  min_normal NUMERIC,
  max_normal NUMERIC,
  min_critical NUMERIC,
  max_critical NUMERIC,
  last_value NUMERIC,
  last_reading_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_sensors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all sensors"
  ON public.asset_sensors FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view sensors"
  ON public.asset_sensors FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Time-series sensor readings
CREATE TABLE public.sensor_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sensor_id UUID NOT NULL REFERENCES public.asset_sensors(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'normal', -- normal, warning, critical
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all sensor readings"
  ON public.sensor_readings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view sensor readings"
  ON public.sensor_readings FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Digital twin health scores / predictive analysis cache
CREATE TABLE public.digital_twin_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE UNIQUE,
  health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  predicted_failure_at TIMESTAMP WITH TIME ZONE,
  failure_probability NUMERIC, -- 0.0 to 1.0
  anomalies JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  last_analysed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.digital_twin_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage digital twin health"
  ON public.digital_twin_health FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view digital twin health"
  ON public.digital_twin_health FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- Trigger to update updated_at on asset_sensors
CREATE TRIGGER update_asset_sensors_updated_at
  BEFORE UPDATE ON public.asset_sensors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_digital_twin_health_updated_at
  BEFORE UPDATE ON public.digital_twin_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for time-series queries
CREATE INDEX idx_sensor_readings_sensor_id_recorded_at ON public.sensor_readings(sensor_id, recorded_at DESC);
CREATE INDEX idx_sensor_readings_asset_id_recorded_at ON public.sensor_readings(asset_id, recorded_at DESC);

-- Enable realtime for live sensor updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.asset_sensors;
