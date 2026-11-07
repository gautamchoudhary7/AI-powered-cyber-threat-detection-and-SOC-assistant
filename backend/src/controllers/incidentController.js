const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Incident = require('../models/Incident');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../services/auditService');
const { incidentQuerySchema } = require('../validators/incidentSchemas');

const { trusted } = mongoose;

// Analysts work with their own incidents and alerts; admins can see and change all of them.
const scopeFor = (user) => (user.role === 'admin' ? {} : { createdBy: user.id });

const publicNote = (n) => ({
  id: String(n._id),
  text: n.text,
  author: n.author && n.author.name ? n.author.name : 'Unknown user',
  createdAt: n.createdAt,
});

const publicIncident = (i) => ({
  id: String(i._id || i.id),
  title: i.title,
  description: i.description || '',
  severity: i.severity,
  status: i.status,
  alertCount: Array.isArray(i.alerts) ? i.alerts.length : 0,
  noteCount: Array.isArray(i.notes) ? i.notes.length : 0,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
});

async function findIncidentFor(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Incident not found');
  const incident = await Incident.findOne({ _id: req.params.id, ...scopeFor(req.user) });
  if (!incident) throw new HttpError(404, 'Incident not found');
  return incident;
}

// POST /api/incidents
const create = asyncHandler(async (req, res) => {
  const { title, description, severity, alertIds } = req.body;
  const uniqueIds = [...new Set(alertIds || [])];

  if (uniqueIds.length > 0) {
    // You can only link alerts you are allowed to see, so ids cannot be used to probe other users' data.
    const found = await Alert.countDocuments({ _id: trusted({ $in: uniqueIds }), ...scopeFor(req.user) });
    if (found !== uniqueIds.length) throw new HttpError(400, 'One or more of the linked alerts could not be found');
  }

  const incident = await Incident.create({
    title,
    description,
    severity: severity || 'medium',
    alerts: uniqueIds,
    createdBy: req.user.id,
  });
  await audit.log({
    actor: req.user.id, action: 'incident.created', resourceType: 'Incident',
    resourceId: String(incident.id), ip: req.ip, metadata: { alertCount: uniqueIds.length },
  });
  res.status(201).json({ success: true, data: { incident: publicIncident(incident) } });
});

// GET /api/incidents?page=&limit=&status=&severity=&order=
const list = asyncHandler(async (req, res) => {
  const parsed = incidentQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  const q = parsed.data;
  const filter = { ...scopeFor(req.user) };
  if (q.status) filter.status = q.status;
  if (q.severity) filter.severity = q.severity;
  const direction = q.order === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    Incident.find(filter).sort({ createdAt: direction, _id: direction }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Incident.countDocuments(filter),
  ]);
  res.status(200).json({
    success: true,
    data: items.map(publicIncident),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
});

// GET /api/incidents/:id   (includes linked alert summaries and notes)
const getOne = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Incident not found');
  const incident = await Incident.findOne({ _id: req.params.id, ...scopeFor(req.user) }).populate('notes.author', 'name');
  if (!incident) throw new HttpError(404, 'Incident not found');

  const alerts = incident.alerts.length
    ? await Alert.find({ _id: trusted({ $in: incident.alerts }) })
        .select('severity status attackCategory confidence sourceFileName rowIndex')
        .lean()
    : [];

  res.status(200).json({
    success: true,
    data: {
      incident: {
        ...publicIncident(incident),
        alerts: alerts.map((a) => ({
          id: String(a._id), severity: a.severity, status: a.status, attackCategory: a.attackCategory || null,
          attackScore: a.confidence, sourceFileName: a.sourceFileName, csvLine: typeof a.rowIndex === 'number' ? a.rowIndex + 2 : null,
        })),
        notes: incident.notes.map(publicNote),
      },
    },
  });
});

// PATCH /api/incidents/:id
const update = asyncHandler(async (req, res) => {
  const incident = await findIncidentFor(req);
  const before = { status: incident.status, severity: incident.severity };
  for (const field of ['title', 'description', 'severity', 'status']) {
    if (req.body[field] !== undefined) incident[field] = req.body[field];
  }
  await incident.save();
  await audit.log({
    actor: req.user.id, action: before.status !== incident.status ? 'incident.status_changed' : 'incident.updated',
    resourceType: 'Incident', resourceId: String(incident.id), ip: req.ip,
    metadata: { fields: Object.keys(req.body), from: before, to: { status: incident.status, severity: incident.severity } },
  });
  res.status(200).json({ success: true, data: { incident: publicIncident(incident) } });
});

// POST /api/incidents/:id/notes
const addNote = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Incident not found');
  // One atomic update, so two analysts adding notes at the same moment never overwrite each other.
  const incident = await Incident.findOneAndUpdate(
    { _id: req.params.id, ...scopeFor(req.user) },
    { $push: { notes: { author: req.user.id, text: req.body.text } } },
    { new: true }
  );
  if (!incident) throw new HttpError(404, 'Incident not found');
  const note = incident.notes[incident.notes.length - 1];
  // The note text is not copied into the audit log (it may contain sensitive investigation details).
  await audit.log({ actor: req.user.id, action: 'incident.note_added', resourceType: 'Incident', resourceId: String(incident.id), ip: req.ip });
  res.status(201).json({ success: true, data: { note: publicNote({ ...note.toObject(), author: { name: req.user.name } }) } });
});

module.exports = { create, list, getOne, update, addNote };
