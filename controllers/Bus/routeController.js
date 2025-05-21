// controllers/routeController.js
const { Route } = require("../../models/Bus");

exports.getAllRoutes = async (req, res) => {
  try {
    const routes = await Route.find();
    res.json(routes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createRoute = async (req, res) => {
  try {
    const route = new Route(req.body);
    await route.save();
    res.status(201).json(route);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateRoute = async (req, res) => {
  try {
    const route = await Route.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!route) return res.status(404).json({ error: "Route not found" });
    res.json(route);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteRoute = async (req, res) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);
    if (!route) return res.status(404).json({ error: "Route not found" });
    res.json({ message: "Route deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};