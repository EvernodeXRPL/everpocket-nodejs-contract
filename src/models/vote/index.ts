import VoteSerializer from "../../vote/VoteSerializer";

export interface VoteContextOptions {
  voteSerializer?: VoteSerializer;
}

export interface VoteElectorOptions {
  timeout?: number;
}