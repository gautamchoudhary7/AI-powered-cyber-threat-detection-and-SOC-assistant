const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const DetectionJob = require('../models/DetectionJob');
const Incident = require('../models/Incident');
const HttpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { trendsQuerySchema } = require('../validators/dashboardSchemas');
const { rangeStart, fillDailySeries, topCategories } = require('../utils/dashboardHelpers');

const { trusted } = mongoose;

// Analysts see numbers from their own uploads; admins see everyone's.
// Aggregations do NOT convert text ids to ObjectIds automatically, so the conversion is explicit here.
const matchFor = (user, field) => (user.role === 'admin' ? {} : { [field]: new mongoose.Types.ObjectId(String(user.id)) });
const findScopeFor = (user) => (user.role === 'admin' ? {} : { createdBy: user.id });

// GET /api/dashboard/stats
const stats = asyncHandler(async (req, res) => {
  const [jobTotals, totalAlerts, highSeverityAlerts, openIncidents, categoryRows] = await Promise.all([
    DetectionJob.aggregate([
      { $match: { ...matchFor(req.user, 'owner'), status: 'completed' } },
      { $group: { _id: null, rows: { $sum: '$totalRows' }, jobs: { $sum: 1 } } },
    ]),
    Alert.countDocuments(findScopeFor(req.user)),
    // These operators are ours (not from the user), so they are marked trusted for sanitizeFilter.
    Alert.countDocuments({ ...findScopeFor(req.user), severity: trusted({ $in: ['high', 'critical'] }) }),
    Incident.countDocuments({ ...findScopeFor(req.user), status: trusted({ $ne: 'closed' }) }),
    Alert.aggregate([{ $match: matchFor(req.user, 'createdBy') }, { $group: { _id: '$attackCategory', count: { $sum: 1 } } }]),
  ]);

  const totals = jobTotals[0] || { rows: 0, jobs: 0 };
  res.status(200).json({
    success: true,
    data: {
      totalAnalyzedRecords: totals.rows,
      completedAnalyses: totals.jobs,
      totalAlerts,
      highSeverityAlerts,
      openIncidents,
      categoryDistribution: topCategories(categoryRows, 6),
    },
  });
});

// GET /api/dashboard/trends?days=14   (alerts per UTC day; days must be 7, 14, 30 or 90)
const trends = asyncHandler(async (req, res) => {
  const parsed = trendsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  const { days } = parsed.data;
  const now = new Date();
  const rows = await Alert.aggregate([
    { $match: { ...matchFor(req.user, 'createdBy'), createdAt: { $gte: rangeStart(days, now) } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        total: { $sum: 1 },
        high: { $sum: { $cond: [{ $gte: ['$severityRank', 3] }, 1, 0] } },
      },
    },
  ]);
  res.status(200).json({ success: true, data: { days, timezone: 'UTC', series: fillDailySeries(rows, days, now) } });
});

module.exports = { stats, trends };
