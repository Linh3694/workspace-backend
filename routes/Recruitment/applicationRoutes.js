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
router.get("/", applicationController.getApplications);
router.get("/job/:jobId", applicationController.getApplicationsByJob);

module.exports = router;