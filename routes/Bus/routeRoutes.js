// routes/routeRoutes.js
const express = require("express");
const router = express.Router();
const routeController = require("../../controllers/Bus/routeController");

router.get("/", routeController.getAllRoutes);
router.post("/", routeController.createRoute);
router.put("/:id", routeController.updateRoute);
router.delete("/:id", routeController.deleteRoute);

module.exports = router;