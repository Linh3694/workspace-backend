const express = require('express');
const router = express.Router();
const gradeLevelController = require('../../controllers/SIS/gradeLevelController');
const { authenticateToken, isAdmin } = require('../../middleware/auth');

// Áp dụng middleware xác thực cho tất cả các route
router.use(authenticateToken);

router.get('/', gradeLevelController.getAllGradeLevels);
router.get('/:educationalSystemId', gradeLevelController.getGradeLevelsByEducationalSystem);
router.post('/', isAdmin, gradeLevelController.createGradeLevel);
router.put('/:id', isAdmin, gradeLevelController.updateGradeLevel);
router.delete('/:id', isAdmin, gradeLevelController.deleteGradeLevel);

module.exports = router; 