import { options } from "./interfaces";
import mongoose, { Document } from "mongoose";
import { Client, Message, User, VoiceState } from "discord.js";
import ms from "ms";

export class VoiceClient {
    public client: Client;
    public options: options;

    public schemas = {
        timer: mongoose.model(
            "djs-voice-timers",
            new mongoose.Schema({
                User: String,
                Start: Number,
                Guild: String,
            })
        ),
        user: mongoose.model(
            "djs-voice-users",
            new mongoose.Schema({
                User: String,
                Time: Number,
                Guild: String,
            })
        ),
    };
    constructor(options: options) {
        if (mongoose.connection.readyState === 1) return;
        if (!options.mongooseConnectionString)
            throw new Error(
                "There is no established  connection with mongoose and a mongoose connection is required!"
            );
        mongoose.connect(options.mongooseConnectionString, {
            useFindAndModify: true,
            useUnifiedTopology: true,
            useNewUrlParser: true,
        });
        this.options = options;
        this.client = options.client;
    }

    public async startListener(oldState: VoiceState, newState: VoiceState) {
        if (newState.member.user.bot && !this.options.allowBots) return;
        const userID = newState.member.id;
        const guildID = newState.guild.id;

        if (
            newState.channel &&
            !(await this.schemas.timer.findOne({
                User: userID,
                Guild: guildID,
            }))
        ) {
            if (this.options.debug)
                console.log(
                    `${newState.member.user.tag} has joined a voice channel`
                );

            new this.schemas.timer({
                User: userID,
                Start: Date.now(),
                Guild: guildID,
            }).save();
        }

        if (oldState.channel.id && !newState.channel.id) {
            if (this.options.debug)
                console.log(
                    `${newState.member.user.tag} has left a voice channel`
                );

            this.schemas.timer.findOne(
                { User: userID, Guild: guildID },
                async (err, timerData) => {
                    if (!timerData) return;

                    this.schemas.user.findOne(
                        { User: userID, Guild: guildID },
                        async (err, userData) => {
                            const Time = Date.now() - timerData.Start;
                            timerData.delete();
                            if (this.options.debug)
                                console.log(
                                    ms(Time, { long: true }) +
                                        ` for ${newState.member.user.tag}`
                                );
                            if (!userData) {
                                new this.schemas.user({
                                    User: userID,
                                    Time,
                                    Guild: guildID,
                                }).save();
                            } else {
                                userData.Time += Time;
                                userData.save();
                            }
                        }
                    );
                }
            );
        }
    }

    private async sortUsers(message: Message): Promise<Document[]> {
        const userLeaderboard = await this.schemas.user
            .find({ Guild: message.guild.id })
            .sort({ Time: -1 });

        return userLeaderboard;
    }

    public async getUserData(message: Message, user: User) {
        const data = await this.schemas.user.findOne({
            Guild: message.guild.id,
            User: user.id,
        });
        const position = (await this.sortUsers(message)).findIndex(
            (x: any) => x.User === user.id
        );

        return { ...data, position };
    }
}
