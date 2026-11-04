// MongoDB initialization: create suvion database with schema validation
// that enforces the no-PII policy on sensor and emissions collections.
//
// Note: _id must be listed explicitly in properties when additionalProperties
// is false — MongoDB 7 treats _id as an additional property otherwise.

db = db.getSiblingDB("suvion");

db.createCollection("sensorreadings", {
  validator: {
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
  },
});

db.sensorreadings.createIndex({ stream: 1, timestamp: 1 });
db.sensorreadings.createIndex({ timestamp: 1 });

db.createCollection("emissionsreadings", {
  validator: {
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
  },
});

db.emissionsreadings.createIndex({ timestamp: 1 });

db.createCollection("anomalyevents", {
  validator: {
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
  },
});

db.anomalyevents.createIndex({ timestamp: -1, score: -1 });

db.createCollection("lifecyclelogs");

print(
  "Suvion MongoDB initialized: collections sensorreadings, emissionsreadings, anomalyevents, lifecyclelogs",
);
