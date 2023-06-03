import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  accounts: [
    {
      address: String,
      privateKey: String,
      history: [
        {
          to: String,
          value: String,
          time: String,
          from: String,
        },
      ],
    },
  ],
});
const user = mongoose.model("user", userSchema);

export default user;
