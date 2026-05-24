package com.example.board.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.board.dto.PostRequestDto;
import com.example.board.dto.PostResponseDto;
import com.example.board.service.PostService;

// REST API용 컨트롤러 (@Controller + @ResponseBody의 합)
@RestController
// 이 컨트롤러의 모든 엔드포인트는 /posts 경로 하위로 매핑
@RequestMapping("/posts")
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    // GET /posts → 전체 조회
    @GetMapping
    public ResponseEntity<List<PostResponseDto>> findAll() {
        return ResponseEntity.ok(postService.findAll());
    }

    // GET /posts/{id} → 단건 조회
    @GetMapping("/{id}")
    public ResponseEntity<PostResponseDto> findById(
            // URL 경로의 {id} 부분을 메서드 파라미터로 바인딩
            @PathVariable Long id
    ) {
        return ResponseEntity.ok(postService.findById(id));
    }

    // POST /posts → 새 게시글 생성
    @PostMapping
    public ResponseEntity<PostResponseDto> create(
            // 요청 바디(JSON)를 DTO로 역직렬화
            @RequestBody PostRequestDto request
    ) {
        PostResponseDto created = postService.create(request);
        // 생성 성공 시 201 Created 반환
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    // PUT /posts/{id} → 게시글 수정
    @PutMapping("/{id}")
    public ResponseEntity<PostResponseDto> update(
            @PathVariable Long id,
            @RequestBody PostRequestDto request
    ) {
        return ResponseEntity.ok(postService.update(id, request));
    }

    // DELETE /posts/{id} → 게시글 삭제
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        postService.delete(id);
        // 본문 없음 → 204 No Content
        return ResponseEntity.noContent().build();
    }

    // 존재하지 않는 id 요청 시 404 응답으로 변환
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleNotFound(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
    }
}
