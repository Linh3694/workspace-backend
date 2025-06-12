const express = require("express");
const router = express.Router();
const applicationController = require("../../controllers/Recruitment/applicationController");
const uploadCV = require("../../middleware/uploadCV");
const uploadApplication = require("../../middleware/uploadApplication");

router.post(
    "/",
    uploadApplication.fields([
        { name: "cvFile", maxCount: 1 },
        { name: "profilePicture", maxCount: 1 }
    ]),
    applicationController.submitApplication
);

router.post(
    "/open-position",
    uploadApplication.fields([
        { name: "cvFile", maxCount: 1 },
        { name: "profilePicture", maxCount: 1 }
    ]),
    applicationController.submitOpenPositionApplication
);

router.get("/", applicationController.getApplications);
router.get("/job/:jobId", applicationController.getApplicationsByJob);
router.get("/open-positions", applicationController.getOpenPositionApplications);

module.exports = router;