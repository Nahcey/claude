package com.example.board.entity;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// JPA 엔티티임을 명시 (DB 테이블과 매핑되는 클래스)
@Entity
// 매핑할 테이블명을 'posts'로 지정 (기본값은 클래스명)
@Table(name = "posts")
public class Post {

    // PK(기본키) 필드 표시
    @Id
    // PK 값을 DB의 IDENTITY(자동 증가) 전략으로 생성
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 제목 컬럼: not null, 최대 200자
    @Column(nullable = false, length = 200)
    private String title;

    // 본문 컬럼: not null, 긴 텍스트 저장 위해 TEXT 타입 사용
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    // INSERT 시점에 자동으로 현재 시간이 채워지도록 설정
    @CreationTimestamp
    // 한 번 저장된 후에는 수정/덮어쓰기 불가
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected Post() {
        // JPA가 리플렉션으로 인스턴스를 만들 때 필요한 기본 생성자
    }

    public Post(String title, String content) {
        this.title = title;
        this.content = content;
    }

    public void update(String title, String content) {
        this.title = title;
        this.content = content;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getContent() {
        return content;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
