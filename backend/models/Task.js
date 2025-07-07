const mongoose = require('mongoose');
const { Schema } = mongoose;

const GoodsSchema = new Schema({
    name: { type: String, required: true },
    estimatedQuantity: { type: Number, required: true },
    estimatedPricePerPiece: { type: Number, required: true },
    estimatedCost: { type: Number, required: true },
    actualQuantity: { type: Number, default: 0 },
    actualPricePerPiece: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 }
}, { _id: false });

const ServiceSchema = new Schema({
    estimatedHours: { type: Number, required: true },
    estimatedPeople: { type: Number, required: true },
    costPerPerson: { type: Number, required: true },
    estimatedCost: { type: Number, required: true },
    actualHours: { type: Number, default: 0 },
    actualPeople: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 }
}, { _id: false });

const SubtaskSchema = new Schema({
    description: String,
    startTime: String,
    endTime: String,
    priority: { type: String, enum: ['Priority', 'Non-Priority'], default: 'Non-Priority' },
    completed: { type: Boolean, default: false },
    status: { type: String, enum: ['Pending', 'In Progress', 'Completed', 'Frozen'], default: 'Pending' },
    type: { type: String, enum: ['Good', 'Service'], default: 'Service' },
    goods: { type: GoodsSchema, required: function() { return this.type === 'Good'; } },
    service: { type: ServiceSchema, required: function() { return this.type === 'Service'; } }
}, { _id: true });


const TaskSchema = new Schema({
    description: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    priority: { type: String, enum: ['Priority', 'Non-Priority'], default: 'Non-Priority' },
    status: { type: String, enum: ['In Progress', 'Completed', 'Frozen'], default: 'In Progress' },
    googleEventId: String,
    project_id: { type: Number, required: true, index: true },
    team_id: { type: Number, required: true },
    type: { type: String, enum: ['Good', 'Service'], default: 'Service' },
    subtasks: [SubtaskSchema]
}, { timestamps: true });

TaskSchema.index({ project_id: 1, status: 1 });


TaskSchema.pre('save', function(next) {

    if (this.isModified('subtasks') && !this.isModified('team_id')) {
        this.$__.skipValidation = true;
    }
    next();
});

module.exports = mongoose.model('Task', TaskSchema);

