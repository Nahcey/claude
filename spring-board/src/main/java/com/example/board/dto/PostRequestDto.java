package com.example.board.dto;

import com.example.board.entity.Post;

// 클라이언트가 POST / PUT 요청 바디로 보내는 데이터를 받는 DTO
public class PostRequestDto {

    private String title;
    private String content;

    public PostRequestDto() {
        // Jackson이 JSON을 역직렬화할 때 사용하는 기본 생성자
    }

    public PostRequestDto(String title, String content) {
        this.title = title;
        this.content = content;
    }

    // DTO를 엔티티로 변환하는 헬퍼 메서드
    public Post toEntity() {
        return new Post(title, content);
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }
}
