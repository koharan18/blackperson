CREATE TYPE public."Role" AS ENUM ('ADMIN', 'USER');
CREATE TABLE public."User" (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 "passwordHash" text NOT NULL, role public."Role" DEFAULT 'USER' NOT NULL,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL
);
CREATE TABLE public."RestrictedPerson" (
 id text PRIMARY KEY, name text NOT NULL, phone text NOT NULL, "phoneMasked" text NOT NULL,
 "programName" text NOT NULL, reason text NOT NULL, memo text,
 "registeredAt" timestamp(3) NOT NULL, "registeredById" text NOT NULL REFERENCES public."User"(id),
 "deletedAt" timestamp(3), "deletedReason" text,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL
);
CREATE TABLE public."AuditLog" (
 id text PRIMARY KEY, "userId" text REFERENCES public."User"(id) ON DELETE SET NULL,
 action text NOT NULL, "targetType" text NOT NULL, "targetId" text,
 "beforeData" jsonb, "afterData" jsonb, "ipAddress" text,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public._prisma_migrations (
 id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL,
 finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text,
 rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0
);
CREATE INDEX ON public."RestrictedPerson" ("registeredAt");
CREATE INDEX ON public."AuditLog" ("createdAt");
