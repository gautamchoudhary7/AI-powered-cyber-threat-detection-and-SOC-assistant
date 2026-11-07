const express = require('express');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { createIncidentSchema, updateIncidentSchema, noteSchema } = require('../validators/incidentSchemas');
const controller = require('../controllers/incidentController');

function createIncidentRouter() {
  const router = express.Router();
  router.use(authenticate);
  router.post('/', validate(createIncidentSchema), controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.getOne);
  router.patch('/:id', validate(updateIncidentSchema), controller.update);
  router.post('/:id/notes', validate(noteSchema), controller.addNote);
  return router;
}

module.exports = createIncidentRouter;
