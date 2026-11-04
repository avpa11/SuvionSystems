import mongoose, { Schema, model } from "mongoose";
import { log } from "@repo/logger";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/suvion";

export async function connectMongo(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  await syncMongoValidation();
  log("MongoDB connected");
}

async function createOrModifyCollection(
  name: string,
  validator: Record<string, unknown>,
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  const exists = await db.listCollections({ name }).hasNext();
  if (exists) {
    await db.command({ collMod: name, validator });
  } else {
    try {
      await db.createCollection(name, { validator });
    } catch (err) {
      // Mongoose may create an indexed collection after listCollections returns.
      if ((err as { code?: number }).code !== 48) throw err;
      await db.command({ collMod: name, validator });
    }
  }
}

export async function syncMongoValidation(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  const emissionsValidator = {
    $jsonSchema: {
      bsonType: "object",
      required: ["fuelType", "consumptionL", "co2Kg", "cacheHit", "timestamp"],
      properties: {
        _id: { bsonType: "objectId" },
        fuelType: { bsonType: "string" },
        fuelRateLh: { bsonType: ["double", "int", "long", "decimal", "null"] },
        co2RateKgh: { bsonType: ["double", "int", "long", "decimal", "null"] },
        sampleIntervalSeconds: {
          bsonType: ["double", "int", "long", "decimal", "null"],
        },
        consumptionL: { bsonType: ["double", "int", "long", "decimal"] },
        co2Kg: { bsonType: ["double", "int", "long", "decimal"] },
        cacheHit: { bsonType: "bool" },
        timestamp: { bsonType: "date" },
      },
      additionalProperties: false,
    },
  };

  const anomalyValidator = {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "timestamp",
        "score",
        "isAnomaly",
        "features",
        "source",
        "createdAt",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        timestamp: { bsonType: "date" },
        score: { bsonType: ["double", "int", "long", "decimal"] },
        isAnomaly: { bsonType: "bool" },
        features: { bsonType: "object" },
        contributing: { bsonType: "array", items: { bsonType: "string" } },
        source: { bsonType: "string" },
        createdAt: { bsonType: "date" },
      },
      additionalProperties: false,
    },
  };

  {
    await createOrModifyCollection("sensorreadings", {
      $jsonSchema: {
        bsonType: "object",
        required: ["stream", "value", "unit", "timestamp"],
        properties: {
          _id: { bsonType: "objectId" },
          stream: {
            bsonType: "string",
            enum: ["fuel", "generator", "water", "temperature"],
          },
          value: { bsonType: ["double", "int", "long", "decimal"] },
          unit: { bsonType: "string" },
          timestamp: { bsonType: "date" },
        },
        additionalProperties: false,
      },
    });
    await createOrModifyCollection("emissionsreadings", emissionsValidator);
    await createOrModifyCollection("anomalyevents", anomalyValidator);
    await db.collection("emissionsreadings").createIndex({ timestamp: 1 });
    await db
      .collection("anomalyevents")
      .createIndex({ timestamp: -1, score: -1 });
  }
}

// ─── Sensor reading schema ────────────────────────────────────────────────────

const sensorReadingSchema = new Schema(
  {
    stream: {
      type: String,
      required: true,
      enum: ["fuel", "generator", "water", "temperature"],
    },
    value: { type: Number, required: true },
    unit: { type: String, required: true },
    timestamp: { type: Date, required: true, index: true },
  },
  {
    strict: true,
    // MongoDB collection validator uses additionalProperties:false — __v must not be added
    versionKey: false,
  },
);

sensorReadingSchema.index({ stream: 1, timestamp: 1 });

export const SensorReading = model("SensorReading", sensorReadingSchema);

// ─── Emissions reading schema ─────────────────────────────────────────────────

const emissionsReadingSchema = new Schema(
  {
    fuelType: { type: String, required: true },
    fuelRateLh: { type: Number },
    co2RateKgh: { type: Number },
    sampleIntervalSeconds: { type: Number },
    consumptionL: { type: Number, required: true },
    co2Kg: { type: Number, required: true },
    cacheHit: { type: Boolean, required: true },
    timestamp: { type: Date, required: true, index: true },
  },
  { strict: true, versionKey: false },
);

export const EmissionsReading = model(
  "EmissionsReading",
  emissionsReadingSchema,
);

// ─── Anomaly event schema ────────────────────────────────────────────────────

const anomalyEventSchema = new Schema(
  {
    timestamp: { type: Date, required: true, index: true },
    score: { type: Number, required: true },
    isAnomaly: { type: Boolean, required: true, default: true },
    features: { type: Schema.Types.Mixed, required: true },
    contributing: { type: [String], default: [] },
    source: {
      type: String,
      required: true,
      default: "analytics/anomaly_detection.py",
    },
    createdAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
  },
  { strict: true, versionKey: false },
);

anomalyEventSchema.index({ timestamp: -1, score: -1 });

export const AnomalyEvent = model("AnomalyEvent", anomalyEventSchema);

// ─── Data lifecycle log schema ────────────────────────────────────────────────

const lifecycleLogSchema = new Schema(
  {
    event: { type: String, required: true },
    deletedCount: { type: Number },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  { strict: true },
);

export const LifecycleLog = model("LifecycleLog", lifecycleLogSchema);

export { mongoose };
