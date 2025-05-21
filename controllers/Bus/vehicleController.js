// controllers/vehicleController.js
const { Vehicle } = require("../../models/Bus");

exports.getAllVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find();
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createVehicle = async (req, res) => {
  try {
    const vehicle = new Vehicle(req.body);
    await vehicle.save();
    res.status(201).json(vehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!vehicle)
      return res.status(404).json({ error: "Vehicle not found" });
    res.json(vehicle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle)
      return res.status(404).json({ error: "Vehicle not found" });
    res.json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};