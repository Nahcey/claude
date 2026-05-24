package com.example.board.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.example.board.entity.Post;

// JpaRepository를 상속하면 기본 CRUD 메서드(save, findAll, findById, deleteById 등)가 자동 제공됨
// 별도 @Repository 어노테이션은 Spring Data JPA가 알아서 처리하므로 생략 가능
public interface PostRepository extends JpaRepository<Post, Long> {
}
