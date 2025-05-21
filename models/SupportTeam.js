const mongoose = require("mongoose");
const Ticket = require("./Ticket");
const User = require("./Users");

const supportTeamSchema = new mongoose.Schema({
  name: { type: String, default: "IT Support Team" },
  members: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  ],
});

supportTeamSchema.statics.getSupportTeamMembers = async function () {
  const team = await this.findOne({}).populate("members", "fullname jobTitle avatarUrl");
  if (!team) throw new Error("Chưa có support team nào!");

  const membersWithStats = await Promise.all(team.members.map(async (member) => {
    const tickets = await Ticket.find({
      assignedTo: member._id,
      "feedback.rating": { $exists: true }
    });

    let sumRating = 0;
    const badgesCount = {};
    tickets.forEach(t => {
      if (t.feedback?.rating) sumRating += t.feedback.rating;
      (t.feedback?.badges || []).forEach(b => {
        badgesCount[b] = (badgesCount[b] || 0) + 1;
      });
    });

    return {
      _id: member._id,
      fullname: member.fullname,
      jobTitle: member.jobTitle,
      avatarUrl: member.avatarUrl,
      averageRating: tickets.length ? sumRating / tickets.length : 0,
      badgesCount
    };
  }));

  return { teamName: team.name, members: membersWithStats };
};

supportTeamSchema.statics.addMember = async function (userId) {
  if (!userId) throw new Error("Thiếu thông tin userId");
  const user = await User.findById(userId);
  if (!user) throw new Error("User không tồn tại!");

  const team = await this.findOne({});
  if (!team) throw new Error("Chưa có support team nào!");

  if (team.members.some(m => m.toString() === userId)) {
    throw new Error("User đã có trong team!");
  }

  team.members.push(userId);
  await team.save();

  return "Đã thêm user vào supportTeam";
};

supportTeamSchema.statics.removeMember = async function (userId, reqUser) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User không tồn tại!");

  const team = await this.findOne({});
  if (!team) throw new Error("Chưa có support team nào!");

  team.members = team.members.filter((m) => m.toString() !== userId);
  await team.save();

  return `Đã xoá ${user.fullname} khỏi nhóm hỗ trợ`;
};

module.exports = mongoose.model("SupportTeam", supportTeamSchema);