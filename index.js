import express from "express";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import web3 from "./web3.js";
import user from "./schemas/user.js";
const app = express();

function executeFunctionByName(functionName, context, args) {
  var args = Array.prototype.slice.call(arguments, 2);
  var namespaces = functionName.split(".");
  var func = namespaces.pop();
  for (var i = 0; i < namespaces.length; i++) {
    context = context[namespaces[i]];
  }
  return context[func].apply(context, args).call();
}

app.use(cors());
dotenv.config();
const url = `mongodb+srv://pawankumarudassi:${process.env.pass}@cluster0.uxr0tzk.mongodb.net/main?retryWrites=true&w=majority`;

(async function () {
  await mongoose.connect(url);
})();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post("/register", async (req, res) => {
  const username = req.body.username;
  const password = req.body.pass;
  const hashedPass = await bcrypt.hash(password, 4);
  const naya = new user({
    username,
    password: hashedPass,
  });
  const result = await naya.save();
  res.send(result);
});

app.post("/login", async (req, res) => {
  const username = req.body.username;
  const password = req.body.pass;
  const query = await user.find({ username });
  if (query[0]) {
    const authorised = await bcrypt.compare(password, query[0].password);
    const token = jwt.sign({ _id: query[0]._id }, process.env.jwtpass, {
      expiresIn: "2h",
    });
    if (authorised)
      return res.send({
        _id: query[0]._id,
        username: query[0].username,
        token,
        addresses: query[0].accounts,
      });
  }
  res.send({});
});

app.post("/newacc", async (req, res) => {
  const pk = req.body.privateKey;
  const userId = req.body.userId;
  let acc;
  if (!pk) {
    acc = await web3.eth.accounts.create();
  } else {
    acc = await web3.eth.accounts.privateKeyToAccount(pk);
  }
  const encryptedPk = jwt.sign(acc.privateKey, process.env.jwtpkpass);
  const curUser = await user.findOne({ _id: userId });
  await curUser.accounts.push({
    address: acc.address,
    privateKey: encryptedPk,
  });
  const update = await curUser.save();
  res.send(update);
});

app.post("/sendeth", async (req, res) => {
  const { to, amount, token, from } = req.body;
  if (!token) return res.json({});
  let authorised;
  try {
    authorised = jwt.verify(token, process.env.jwtpass);
  } catch (e) {
    return res.json(e);
  }
  const userId = authorised._id;

  const curUser = await user.findById(userId);

  const { accounts } = curUser;
  const acc = accounts.find((a) => a.address == from);
  const pk = acc.privateKey;

  const unlockedPk = jwt.verify(pk, process.env.jwtpkpass);

  const price = String(Math.ceil((await web3.eth.getGasPrice()) * 1.4));
  const signedTransaction = await web3.eth.accounts.signTransaction(
    {
      from,
      value: amount,
      to,
      gasPrice: price,
      gas: "21000",
    },
    unlockedPk
  );

  const receipt = await web3.eth.sendSignedTransaction(
    signedTransaction.rawTransaction
  );

  const curAccountIndex = curUser.accounts.findIndex((a) => a.address == from);
  curUser.accounts[curAccountIndex].history.push({
    to,
    value: amount,
    time: new Date(),
    from,
  });

  res.json(await curUser.save());
});

app.post("/fun", async (req, res) => {
  const {
    fName,
    inputs,
    from,
    contractAddress,
    abi,
    token,
    etherValue: value,
    stateMutability,
    inputAbiObject,
  } = req.body;
  if (!token) return res.json({});
  let authorised;
  try {
    authorised = jwt.verify(token, process.env.jwtpass);
  } catch (e) {
    return res.json(e);
  }
  const instance = new web3.eth.Contract(abi, contractAddress);

  const userId = authorised._id;

  const curUser = await user.findById(userId);

  const { accounts } = curUser;
  const acc = accounts.find((a) => a.address == from);
  const pk = acc.privateKey;

  const unlockedPk = jwt.verify(pk, process.env.jwtpkpass);

  const price = String(Math.ceil((await web3.eth.getGasPrice()) * 1.4));
  const data = await web3.eth.abi.encodeFunctionCall(inputAbiObject, inputs);

  if (stateMutability == "view") {
    return res.json(
      await executeFunctionByName(fName, instance.methods, ...inputs)
    );
  }

  const signedTransaction = await web3.eth.accounts.signTransaction(
    {
      from,
      value,
      to: contractAddress,
      gasPrice: price,
      gas: await web3.eth.estimateGas({
        from,
        data,
        to: contractAddress,
      }),
      data,
    },
    unlockedPk
  );

  const receipt = await web3.eth.sendSignedTransaction(
    signedTransaction.rawTransaction
  );
  res.json(receipt);
});

app.listen(process.env.HOST || "5000");
