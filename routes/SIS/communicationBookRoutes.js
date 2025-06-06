const express = require('express');
const router = express.Router();
const communicationBookController = require('../../controllers/SIS/communicationBookController');

// Routes cho sổ liên lạc
router.get('/', communicationBookController.getCommunicationBooks);
router.get('/student/:studentId', communicationBookController.getCommunicationBooksByStudent);
router.get('/:id', communicationBookController.getCommunicationBookById);
router.post('/', communicationBookController.createCommunicationBook);
router.put('/:id', communicationBookController.updateCommunicationBook);
router.delete('/:id', communicationBookController.deleteCommunicationBook);

module.exports = router; 