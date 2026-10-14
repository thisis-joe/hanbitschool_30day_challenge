package kr.hanbit.school.game;

public record GameItem(
    String itemId, String slot, int value, int rewardDay, String name, String assetKey) {}
