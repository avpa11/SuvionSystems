// MongoDB initialization: create suvion database with schema validation
// that enforces the no-PII policy on sensor and emissions collections.

db = db.getSiblingDB("suvion");

db.createCollection("sensorreadings", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["stream", "value", "unit", "timestamp"],
      properties: {
        stream: { bsonType: "string", enum: ["fuel", "generator", "water", "temperature"] },
        value: { bsonType: "double" },
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
        fuelType: { bsonType: "string" },
        consumptionL: { bsonType: "double" },
        co2Kg: { bsonType: "double" },
        cacheHit: { bsonType: "bool" },
        timestamp: { bsonType: "date" },
      },
      additionalProperties: false,
    },
  },
});

db.emissionsreadings.createIndex({ timestamp: 1 });

db.createCollection("lifecyclelogs");

print("Suvion MongoDB initialized: collections sensorreadings, emissionsreadings, lifecyclelogs");
