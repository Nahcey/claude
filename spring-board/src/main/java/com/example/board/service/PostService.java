package com.example.board.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.board.dto.PostRequestDto;
import com.example.board.dto.PostResponseDto;
import com.example.board.entity.Post;
import com.example.board.repository.PostRepository;

// 비즈니스 로직을 담는 서비스 계층 빈(Bean)으로 등록
@Service
// 클래스 전체에 읽기 전용 트랜잭션 적용 → 쓰기 메서드는 개별로 오버라이드
@Transactional(readOnly = true)
public class PostService {

    private final PostRepository postRepository;

    // 생성자 주입: 스프링 4.3+ 부터 생성자가 하나면 @Autowired 생략 가능
    public PostService(PostRepository postRepository) {
        this.postRepository = postRepository;
    }

    // 전체 게시글 조회
    public List<PostResponseDto> findAll() {
        return postRepository.findAll().stream()
                .map(PostResponseDto::from)
                .toList();
    }

    // 단건 조회
    public PostResponseDto findById(Long id) {
        Post post = getPostOrThrow(id);
        return PostResponseDto.from(post);
    }

    // 게시글 작성 (쓰기 트랜잭션으로 재정의)
    @Transactional
    public PostResponseDto create(PostRequestDto request) {
        Post saved = postRepository.save(request.toEntity());
        return PostResponseDto.from(saved);
    }

    // 게시글 수정 (쓰기 트랜잭션으로 재정의)
    @Transactional
    public PostResponseDto update(Long id, PostRequestDto request) {
        Post post = getPostOrThrow(id);
        // 더티 체킹(Dirty Checking)으로 트랜잭션 커밋 시 자동 UPDATE 실행
        post.update(request.getTitle(), request.getContent());
        return PostResponseDto.from(post);
    }

    // 게시글 삭제 (쓰기 트랜잭션으로 재정의)
    @Transactional
    public void delete(Long id) {
        // 존재하지 않으면 예외 발생 → 컨트롤러에서 404로 처리됨
        Post post = getPostOrThrow(id);
        postRepository.delete(post);
    }

    private Post getPostOrThrow(Long id) {
        return postRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("해당 게시글이 존재하지 않습니다. id=" + id));
    }
}
