-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Studios table
CREATE TABLE studios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Courses table
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  activity TEXT NOT NULL CHECK (activity IN ('yoga', 'pilates', 'hiit', 'barre', 'cycling')),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  places_total INTEGER NOT NULL CHECK (places_total > 0),
  places_left INTEGER NOT NULL CHECK (places_left >= 0),
  price_normal INTEGER NOT NULL CHECK (price_normal > 0), -- en centimes
  price_app INTEGER NOT NULL CHECK (price_app > 0), -- en centimes
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed', 'full')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contraintes métier
  CONSTRAINT valid_prices CHECK (price_app < price_normal),
  CONSTRAINT valid_places CHECK (places_left <= places_total),
  CONSTRAINT future_course CHECK (date >= CURRENT_DATE)
);

-- Reservations table
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  stripe_payment_id TEXT UNIQUE NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  amount_paid INTEGER NOT NULL, -- en centimes
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_courses_date ON courses(date);
CREATE INDEX idx_courses_studio_id ON courses(studio_id);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_date_status ON courses(date, status) WHERE status = 'active';
CREATE INDEX idx_reservations_course_id ON reservations(course_id);
CREATE INDEX idx_reservations_email ON reservations(user_email);
CREATE INDEX idx_reservations_stripe_payment ON reservations(stripe_payment_id);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_studios_updated_at
  BEFORE UPDATE ON studios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function pour décrémenter places atomiquement
CREATE OR REPLACE FUNCTION decrement_course_places(course_uuid UUID)
RETURNS TABLE(success BOOLEAN, places_remaining INTEGER) AS
$$
DECLARE
  current_places INTEGER;
BEGIN
  -- Lock la ligne pour éviter race conditions
  SELECT places_left INTO current_places
  FROM courses
  WHERE id = course_uuid
  FOR UPDATE;

  IF current_places IS NULL THEN
    RETURN QUERY SELECT FALSE, 0;
    RETURN;
  END IF;

  IF current_places > 0 THEN
    UPDATE courses
    SET places_left = places_left - 1,
        status = CASE WHEN places_left - 1 = 0 THEN 'full' ELSE status END
    WHERE id = course_uuid;

    RETURN QUERY SELECT TRUE, current_places - 1;
  ELSE
    RETURN QUERY SELECT FALSE, 0;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS)
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Policies Studios
CREATE POLICY "Studios can view own data"
  ON studios FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Studios can update own data"
  ON studios FOR UPDATE
  USING (auth.uid() = id);

-- Policies Courses
CREATE POLICY "Public can view active courses"
  ON courses FOR SELECT
  USING (status = 'active' AND places_left > 0 AND date >= CURRENT_DATE);

CREATE POLICY "Studios can view own courses"
  ON courses FOR SELECT
  USING (auth.uid() = studio_id);

CREATE POLICY "Studios can insert own courses"
  ON courses FOR INSERT
  WITH CHECK (auth.uid() = studio_id);

CREATE POLICY "Studios can update own courses"
  ON courses FOR UPDATE
  USING (auth.uid() = studio_id);

CREATE POLICY "Studios can delete own courses"
  ON courses FOR DELETE
  USING (auth.uid() = studio_id);

-- Policies Reservations
CREATE POLICY "Studios can view reservations for their courses"
  ON reservations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = reservations.course_id
      AND courses.studio_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own reservations"
  ON reservations FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');

-- Service role peut tout faire (pour webhooks)
CREATE POLICY "Service role full access studios"
  ON studios FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access courses"
  ON courses FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access reservations"
  ON reservations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

