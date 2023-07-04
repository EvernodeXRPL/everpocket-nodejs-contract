import VoteSerializer from "../../vote/VoteSerializer";

export interface VoteOptions {
  voteSerializer?: VoteSerializer;
}

export interface VoteElectorOptions {
  timeout?: number;
}