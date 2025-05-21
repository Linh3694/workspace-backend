// routes/vehicleRoutes.js
const express = require("express");
const router = express.Router();
const vehicleController = require("../../controllers/Bus/vehicleController");

router.get("/", vehicleController.getAllVehicles);
router.post("/", vehicleController.createVehicle);
router.put("/:id", vehicleController.updateVehicle);
router.delete("/:id", vehicleController.deleteVehicle);

module.exports = router;